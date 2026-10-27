-- Read-only regression checks; run after speed_up_visual_media_similarity.
BEGIN;
SET LOCAL statement_timeout = '8s';
DO $$
DECLARE
  sample record;
  expected integer;
BEGIN
  IF public.phash_hamming(NULL, '0') IS NOT NULL
     OR public.phash_hamming('0', NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Null hashes must remain null';
  END IF;
  IF public.phash_hamming('0', '0') <> 0
     OR public.phash_hamming('0', 'f') <> 4
     OR public.phash_hamming('0', 'FFFFFFFFFFFFFFFF') <> 64
     OR public.phash_hamming('1', '0000000000000001') <> 0 THEN
    RAISE EXCEPTION 'Known hash distances changed';
  END IF;
  -- Independent reference: count each bit in decoded bytes, including legacy
  -- left padding/truncation, rather than mirroring the native XOR implementation.
  FOR sample IN
    SELECT md5(g::text) AS a, md5((g + 1)::text) AS b
    FROM generate_series(1, 1000) g
  LOOP
    SELECT count(*) INTO expected FROM generate_series(0, 63) bit_index
    WHERE get_bit(decode(lpad(sample.a, 16, '0'), 'hex'), bit_index)
       <> get_bit(decode(lpad(sample.b, 16, '0'), 'hex'), bit_index);
    IF public.phash_hamming(sample.a, sample.b) <> expected THEN
      RAISE EXCEPTION 'Hash distance differs from reference';
    END IF;
  END LOOP;
END $$;

SET LOCAL ROLE authenticated;
SELECT count(*) AS visual_pairs FROM public.find_visual_duplicates(8, 200);
RESET ROLE;
ROLLBACK;
