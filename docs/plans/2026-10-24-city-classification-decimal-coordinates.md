# Preserve PostgreSQL decimal coordinates in classification captures

A fresh native export of 250 unresolved city classifications produced zero proofs because PostgreSQL numeric coordinates arrive as JSON strings. The source collector required JavaScript numbers, rejecting valid coordinates before distance comparison.

Parse only finite numbers and strict decimal strings at the collector boundary, then emit numeric coordinates. Reject null, blanks, booleans, arrays/objects, hexadecimal, suffixes, non-finite/out-of-range values and the zero pair. An explicit single zero axis remains valid. Name, country, exact source identity, positive settlement class, present-day claims and 10 km distance limits stay intact.

Tests compare a realistic PostgreSQL numeric-string export with the number fixture, exercise malformed inputs and zero axes, and preserve all existing source-classification negative cases. This fixes evidence collection only; no quality findings, identity decisions or publication flags are changed.
