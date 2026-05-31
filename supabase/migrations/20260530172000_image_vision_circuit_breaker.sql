-- Seed the circuit breaker for the (disabled-by-default) image-vision phase.
-- The pipeline-image-vision edge function wraps its model call in
-- withCircuitBreaker('cf-ai-image-aesthetic', ...). Registering it here means
-- the breaker exists and trips after 5 consecutive failures (120s reset) the
-- moment ENABLE_IMAGE_VISION is flipped on. Harmless while the flag is off.

SELECT register_circuit_breaker('cf-ai-image-aesthetic', 5, 120);
