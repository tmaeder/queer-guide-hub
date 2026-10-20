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
competing = None
conversation = str(uuid.uuid4())
group = str(uuid.uuid4())
trip = str(uuid.uuid4())
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
    # Two different digest rows must never reserve the same member/day budget.
    # Hold A's reservation uncommitted while B tries to authorize another row.
    user = users[0]
    query(f"insert into public.profiles(user_id) values('{user}')")
    query(f"select public.email_delivery_preferences_save('{user}',true,'Etc/UTC',false,22,8,0)")
    query(f"insert into public.conversations(id) values('{conversation}')")
    query(f"insert into public.conversation_participants(user_id,conversation_id,last_read_at) values('{user}','{conversation}',now()-interval '1 day')")
    query(f"insert into public.notifications(user_id,type,related_id,created_at) values('{user}','dm','{conversation}',now()-interval '3 hours')")
    query(f"select public.email_delivery_preferences_save('{user}',true,'Etc/UTC',false,22,8,1,true)")
    query(f"insert into public.community_groups(id) values('{group}')")
    query(f"insert into public.group_memberships(group_id,user_id) values('{group}','{user}'),('{group}','{users[1]}')")
    mentions = json.dumps([{"user_id": user}])
    query(f"insert into public.group_posts(group_id,user_id,mentions,content) values('{group}','{users[1]}','{mentions}','Private fixture content')")
    source = query(f"select id from public.email_group_mentions where user_id='{user}' and group_id='{group}'")
    assert re.fullmatch(r"[a-f0-9-]{36}", source), source
    rows = []
    for suffix in ('a', 'b'):
        payload = json.dumps({"category": "transactional", "from": "hello@queer.guide",
                              "to": f"{user}@example.invalid", "subject": "Unread", "html": "<p>Open app</p>", "text": "Open app", "headers": {}})
        outbox = query(f"select (public.email_enqueue('{user}-{suffix}','{user}@example.invalid','{payload}','dm_digest',null,'{user}')).id") if suffix == 'a' else query(f"select (public.email_group_mention_enqueue('{source}','{payload}')).id")
        lease = query(f"select lease_id from public.email_claim(1,'{outbox}')")
        assert re.fullmatch(r"[a-f0-9-]{36}", lease), lease
        rows.append((outbox, lease))
    connection = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, bufsize=0)
    connection.stdin.write((f"begin;\nselect public.email_dispatch_authorize('{rows[0][0]}','{rows[0][1]}');\n\\echo READY\n").encode())
    connection.stdin.flush()
    assert "t" in barrier(connection)
    competing = subprocess.Popen(psql + ["-c", f"select public.email_dispatch_authorize('{rows[1][0]}','{rows[1][1]}')"],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    # B cannot pass the unique reservation while A's transaction is still open.
    time.sleep(0.2)
    assert competing.poll() is None, "Competing authorization bypassed the open reservation"
    connection.stdin.write(b"commit;\n\\q\n")
    connection.stdin.flush()
    connection.wait(timeout=5)
    output, errors = competing.communicate(timeout=10)
    assert competing.returncode == 0, errors
    assert output.strip() == "f", "Both identities acquired the daily delivery budget"
    assert query(f"select public.email_dispatch_authorize('{rows[0][0]}','{rows[0][1]}')") == "t", "Same-identity replay lost its reservation"
    print("Overlapping DM/group authorizations passed: one shared daily budget, same-identity retries allowed.")
    # Keep sender erasure open while a concurrent post attempts to create a
    # new mention source. After the scrub commits, capture must remain disabled.
    connection = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, bufsize=0)
    connection.stdin.write((f"begin;\nselect public.email_erase_account('{users[1]}');\n\\echo READY\n").encode())
    connection.stdin.flush()
    barrier(connection)
    competing = subprocess.Popen(psql + ["-c", f"insert into public.group_posts(group_id,user_id,mentions,content) values('{group}','{users[1]}','{mentions}','Concurrent private fixture')"],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    time.sleep(0.2)
    assert competing.poll() is None, "Source capture bypassed the sender erasure barrier"
    connection.stdin.write(b"commit;\n\\q\n")
    connection.stdin.flush()
    connection.wait(timeout=5)
    output, errors = competing.communicate(timeout=10)
    assert competing.returncode == 0, errors
    assert query(f"select count(*) from public.email_group_mentions where actor_user_id='{users[1]}'") == "0", "Source reappeared after sender erasure"
    print("Sender-erasure race passed: concurrent source capture cannot recreate erased metadata.")
    # Invitation creation and responses derive actors from the edge boundary;
    # here service RPCs exercise the same row/account locking on disposable users.
    inviter = users[2]
    username = 'contract_' + uuid.uuid4().hex[:16]
    query(f"update public.profiles set username='{username}' where user_id='{user}'")
    query(f"select public.email_delivery_preferences_save('{user}',true,'Etc/UTC',false,22,8,2,true,true)")
    query(f"insert into public.trips(id,owner_id) values('{trip}','{inviter}')")
    query(f"insert into public.trip_members(trip_id,user_id,role,accepted_at) values('{trip}','{inviter}','owner',now())")
    invitation = query(f"select public.trip_invitation_create('{inviter}','{trip}','{username}','viewer')")
    trip_payload = json.dumps({"category":"transactional","from":"hello@queer.guide","to":f"{user}@example.invalid","subject":"Trip invitation","html":"<p>Sign in to review</p>","text":"Sign in to review","headers":{}})
    trip_outbox = query(f"select (public.email_trip_invitation_enqueue('{invitation}','{trip_payload}')).id")
    assert query(f"select public.email_activity_message_reason('{trip_outbox}')") == 'activity_daily_budget', "Trip invitation bypassed the DM/group daily budget"
    connection = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, bufsize=0)
    connection.stdin.write((f"begin;\nselect public.trip_invitation_respond('{user}','{invitation}','accept');\n\\echo READY\n").encode())
    connection.stdin.flush()
    barrier(connection)
    competing = subprocess.Popen(psql + ["-c",f"select public.trip_invitation_revoke('{inviter}','{invitation}')"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    time.sleep(0.2)
    assert competing.poll() is None, "Revocation bypassed an in-flight acceptance"
    connection.stdin.write(b"commit;\n\\q\n")
    connection.stdin.flush()
    connection.wait(timeout=5)
    output, errors = competing.communicate(timeout=10)
    assert competing.returncode == 0 and output.strip() == 'f', errors
    assert query(f"select accepted_at is not null from public.trip_members where trip_id='{trip}' and user_id='{user}'") == 't', "Revocation removed accepted access"
    print("Acceptance/revocation race passed: the losing revoke cannot remove accepted access.")
    query(f"delete from public.trip_members where trip_id='{trip}' and user_id='{user}'")
    invitation = query(f"select public.trip_invitation_create('{inviter}','{trip}','{username}','viewer')")
    connection = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, bufsize=0)
    connection.stdin.write((f"begin;\nselect public.email_erase_account('{inviter}');\n\\echo READY\n").encode())
    connection.stdin.flush()
    barrier(connection)
    competing = subprocess.Popen(psql + ["-c",f"select public.trip_invitation_respond('{user}','{invitation}','accept')"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    time.sleep(0.2)
    assert competing.poll() is None, "Acceptance bypassed the inviter erasure barrier"
    connection.stdin.write(b"commit;\n\\q\n")
    connection.stdin.flush()
    connection.wait(timeout=5)
    output, errors = competing.communicate(timeout=10)
    assert competing.returncode != 0 and 'invitation_unavailable' in errors, errors
    assert query(f"select accepted_at is null from public.trip_members where trip_id='{trip}' and user_id='{user}'") == 't', "Erased inviter still granted access"
    print("Invitation erasure race passed: a concurrent acceptance cannot grant stale access.")
finally:
    if competing and competing.poll() is None:
        competing.kill()
        competing.wait(timeout=5)
    if connection and connection.poll() is None:
        connection.kill()
        connection.wait(timeout=5)
    query(f"delete from public.trip_members where trip_id='{trip}'")
    query(f"delete from public.trips where id='{trip}'")
    query(f"delete from public.community_groups where id='{group}'")
    query(f"delete from public.conversations where id='{conversation}'")
    for user in users:
        query(f"delete from public.profiles where user_id='{user}'")
        query(f"delete from auth.users where id='{user}'")
    if journey:
        query(f"delete from public.email_journeys where id='{journey}'")
