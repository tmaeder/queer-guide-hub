-- Pin name resolution to satisfy the database function security policy.
ALTER FUNCTION public.phash_hamming(text, text) SET search_path = '';
