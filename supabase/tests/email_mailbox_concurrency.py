"""Overlapping mailbox requests and erasure against the disposable contracts DB."""
import json
import os
import re
import select
import subprocess
import time
import uuid

if os.environ.get('QG_EMAIL_CONTRACTS') != '1' or os.environ.get('PGHOST') not in ('localhost', '127.0.0.1', '/tmp'):
    raise SystemExit('Requires the local disposable email contract server')
if os.environ.get('PGDATABASE') != 'email_platform' and not os.environ.get('PGDATABASE', '').startswith('qg_email_'):
    raise SystemExit('Refusing a database outside the email contract namespace')
psql = [os.environ.get('PGPSQL', 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
def query(sql):
    return subprocess.check_output(psql + ['-c', sql], text=True, timeout=15).strip()
def barrier(process):
    received = b''
    deadline = time.monotonic() + 15
    while b'READY\n' not in received:
        if time.monotonic() > deadline:
            raise RuntimeError('Mailbox transaction did not reach the barrier')
        readable, _, _ = select.select([process.stdout], [], [], 0.1)
        if readable:
            chunk = os.read(process.stdout.fileno(), 4096)
            if not chunk:
                raise RuntimeError('Mailbox transaction exited before its barrier')
            received += chunk
    return received.decode()
users = [str(uuid.uuid4()) for _ in range(2)]
request = str(uuid.uuid4())
message = json.dumps({'to': 'mailbox-concurrency@example.invalid', 'subject': 'Contract', 'body_text': 'Private synthetic fixture'})
connection = competing = None
ids = []
try:
    for user in users:
        query(f"insert into auth.users(id,email) values('{user}','{user}@example.invalid'); insert into public.profiles(user_id,mailbox_address) values('{user}','mb-{user[:20]}');")
    prepare = f"select public.email_mailbox_prepare('{users[0]}','{request}','{message}')->>'outbox_id';"
    connection = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
    connection.stdin.write(('begin; set local role service_role; ' + prepare + '\n\\echo READY\n').encode())
    connection.stdin.flush()
    first = [line for line in barrier(connection).splitlines() if re.fullmatch(r'[a-f0-9-]{36}', line)][0]
    ids.append(first)
    competing = subprocess.Popen(psql + ['-c', 'begin; set local role service_role; ' + prepare + ' commit;'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    time.sleep(0.2)
    assert competing.poll() is None, 'Duplicate request did not wait for the uncommitted source'
    connection.stdin.write(b'commit;\n\\q\n'); connection.stdin.flush(); connection.wait(timeout=5)
    output, error = competing.communicate(timeout=10)
    assert competing.returncode == 0, error
    assert output.strip() == first, 'Concurrent retries created different outbox identities'
    assert query(f"select count(*) from public.email_mailbox_sends where owner_id='{users[0]}'") == '1'
    assert query(f"select count(*) from public.mailbox_emails where owner_id='{users[0]}'") == '1'
    print('Concurrent mailbox retries converged on one outbox and one sent copy.')
    second = json.loads(query(f"select public.email_mailbox_prepare('{users[1]}','{uuid.uuid4()}','{message}')"))
    ids.append(second['outbox_id'])
    connection = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
    connection.stdin.write((f"begin; select public.email_erase_account('{users[1]}');\n\\echo READY\n").encode()); connection.stdin.flush(); barrier(connection)
    competing = subprocess.Popen(psql + ['-c', f"set role service_role; select public.email_mailbox_prepare('{users[1]}','{uuid.uuid4()}','{message}');"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    time.sleep(0.2)
    assert competing.poll() is None, 'Preparation did not wait for sender erasure'
    connection.stdin.write(b'commit;\n\\q\n'); connection.stdin.flush(); connection.wait(timeout=5)
    output, error = competing.communicate(timeout=10)
    assert competing.returncode != 0 and 'operator_account_disabled' in error, (output, error)
    assert query(f"select count(*) from public.email_mailbox_sends where owner_id='{users[1]}'") == '0'
    assert query(f"select count(*) from public.mailbox_emails where owner_id='{users[1]}'") == '0'
    assert query(f"select (payload='{{}}'::jsonb and erased_at is not null)::text from public.email_outbox where id='{second['outbox_id']}'") == 'true'
    print('Concurrent sender erasure prevented recreated source proof or a new send.')
finally:
    for process in (connection, competing):
        if process and process.poll() is None:
            process.terminate(); process.wait(timeout=5)
    for user in users:
        query(f"delete from public.profiles where user_id='{user}'; delete from auth.users where id='{user}';")
    for outbox in ids:
        query(f"delete from public.email_outbox where id='{outbox}';")
