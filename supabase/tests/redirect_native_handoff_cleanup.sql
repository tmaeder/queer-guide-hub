-- Scheduler seam in isolated PostgreSQL only. The migration's command itself is
-- executed by the JS driver, outside a function, with its real role/transaction.
CREATE SCHEMA cron;
CREATE TABLE cron.test_jobs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text UNIQUE,schedule text,command text);
CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE result bigint;
BEGIN
 INSERT INTO cron.test_jobs(name,schedule,command) VALUES(p_name,p_schedule,p_command)
 ON CONFLICT(name) DO UPDATE SET schedule=excluded.schedule,command=excluded.command
 RETURNING id INTO result;
 RETURN result;
END $$;
