# Preserve distinct book editions during import

The retained Queer Lit records prove that Heartstopper Volume 1 Special Edition
Hardback (ISBN 9781444968934) was matched to Volume 2 (9781444972443). Their
similar titles passed the same-merchant fuzzy threshold. The resulting listing
combines the first volume's title with the second volume's URL and cover.

The authorized maker/import repair requires separate products to stay separate.
Two approaches were considered: extending every SQL candidate RPC result with
edition metadata, or hydrating marketplace book candidates before the existing
pure decision engine. Use the latter to preserve the RPC contract and keep the
comparison independently testable.

For confirmed book input, hydrate candidate titles and attributes in one read.
Reject fuzzy and semantic candidates when both records explicitly identify
different volumes, binding formats or checksum-valid ISBNs. Missing information
does not establish a conflict. Equivalent ISBN-10/13 values compare equal.
Exact source IDs and exact product URLs retain their current update behavior.
Record the guard in the existing dedup decision journal. If candidate hydration
fails, leave the item pending rather than publishing an unchecked decision.

Do not reprocess historical source reviews or automatically split old listings.
Restore the confirmed Heartstopper editions separately from the code release,
using their retained approved source records and verified publisher identities.
