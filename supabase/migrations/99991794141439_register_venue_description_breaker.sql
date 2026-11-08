-- Register the circuit breaker venue-description-backfill has always used.
--
-- The function ran in production for months with no source in the repo; it was
-- brought back in with this PR, which is when circuitBreakerRegistration.test.ts
-- first saw it. Measured before this migration: no `llm.openai.venue-description`
-- row in api_circuit_breakers. checkCircuit() allows on an absent row and
-- circuit_breaker_record_failure() is a bare UPDATE, so the breaker could never
-- trip. Same tuning as every other llm.openai.* breaker (5 failures, 120s).
--
-- ON CONFLICT DO NOTHING, never register_circuit_breaker(): that one is
-- DO UPDATE and would reset tuning on an existing row.

insert into public.api_circuit_breakers (api_name, state, threshold, reset_timeout_seconds)
values ('llm.openai.venue-description', 'closed', 5, 120)
on conflict (api_name) do nothing;
