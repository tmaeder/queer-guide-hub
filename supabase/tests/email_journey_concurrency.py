"""Real overlapping claims against the disposable email contract database."""
import json
import os
import re
import select
import subprocess
import time
import uuid

if os.environ.get("QG_EMAIL_CONTRACTS") != "1":
    raise SystemExit("Requires QG_EMAIL_CONTRACTS=1 and an isolated contract database")
if os.environ.get("PGHOST") not in ("localhost", "127.0.0.1", "/tmp"):
    raise SystemExit("Only the local disposable test server is supported")
database = os.environ.get("PGDATABASE", "")
if database != "email_platform" and not database.startswith("qg_email_"):
    raise SystemExit("Refusing a database outside the email contract namespace")
psql = [os.environ.get("PGPSQL", "psql"), "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]


def query(sql):
    return subprocess.check_output(psql + ["-c", sql], text=True, timeout=15).strip()


def barrier(process):
    received = b""
    deadline = time.monotonic() + 15
    while b"READY\n" not in received:
        if time.monotonic() > deadline:
            raise RuntimeError("Database connection did not reach the transaction barrier")
        readable, _, _ = select.select([process.stdout], [], [], 0.1)
        if readable:
            chunk = os.read(process.stdout.fileno(), 4096)
            if not chunk:
                raise RuntimeError("Database process exited before the barrier")
            received += chunk
    return received.decode().splitlines()


users = [str(uuid.uuid4()) for _ in range(3)]
journey = None
connection = None
try:
    # Control steps only: no send action or real recipient address is used.
    graph = '{"start":"wait","steps":{"wait":{"type":"wait","seconds":60,"next":"end"},"end":{"type":"end"}}}'
    journey = json.loads(query(
        "select public.email_journey_save('Concurrency contract','account.created',"
        f"'created','{graph}','once_per_account','active')"
    ))["id"]
    for user in users[:2]:
        query(f"insert into auth.users(id,email) values('{user}','{user}@example.invalid')")
    assert query("select public.email_journey_enroll()") == "2"
    connection = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, bufsize=0)
    connection.stdin.write(b"begin;\nselect run_id from public.email_journey_claim(1);\n\\echo READY\n")
    connection.stdin.flush()
    # A successful claim remains uncommitted and holds its row lock while B claims.
    lines = [line for line in barrier(connection) if re.fullmatch(r"[a-f0-9-]{36}", line)]
    assert len(lines) == 1, lines
    second = query("begin; select run_id from public.email_journey_claim(1); rollback;")
    assert re.fullmatch(r"[a-f0-9-]{36}", second), second
    assert second != lines[0], "Overlapping workers claimed the same run"
    connection.stdin.write(b"rollback;\n\\q\n")
    connection.stdin.flush()
    connection.wait(timeout=5)
    print("Overlapping journey claims passed: second worker skipped the held row.")
    # The source event exists before publication, but is not visible until
    # its transaction commits afterward. It must still enroll in version 1.
    connection = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, bufsize=0)
    connection.stdin.write((f"begin;\ninsert into auth.users(id,email) values('{users[2]}','{users[2]}@example.invalid');\n\\echo READY\n").encode())
    connection.stdin.flush()
    barrier(connection)
    graph2 = json.loads(graph)
    graph2["steps"]["wait"]["seconds"] = 120
    query("select public.email_journey_save('Concurrency contract','account.created',"
          f"'created','{json.dumps(graph2)}','once_per_account','active',null,'{journey}',1)")
    assert query("select public.email_journey_enroll()") == "0", "Uncommitted source event became visible"
    connection.stdin.write(b"commit;\n\\q\n")
    connection.stdin.flush()
    connection.wait(timeout=5)
    assert query("select public.email_journey_enroll()") == "1", "Late-committing event was lost"
    assert query(f"select version from public.email_journey_runs where journey_id='{journey}' and user_id='{users[2]}'") == "1", "Late event used a newer definition"
    print("Late commit passed: the source event enrolled in its original published version.")
finally:
    if connection and connection.poll() is None:
        connection.kill()
        connection.wait(timeout=5)
    for user in users:
        query(f"delete from auth.users where id='{user}'")
    if journey:
        query(f"delete from public.email_journeys where id='{journey}'")
