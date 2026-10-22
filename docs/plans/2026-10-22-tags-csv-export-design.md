# Tags CSV export

Approved: add Export CSV alongside Export Excel on the tags admin screen.

Both actions fetch every tag through the existing batched fetchAllRows helper,
independently of table filters, search, selection, and pagination. Both use the
same columns and name ordering. CSV uses UTF-8 with a BOM for Excel, CRLF row
separators, quoted and escaped cells, and protects text from formula evaluation.
Each button reports its own format when preparing, completing, or failing.

Verification covers CSV special characters, empty values, download metadata,
all-row batching, and both toolbar actions invoking the unfiltered fetch.

The current navigation opens /admin/content/unified_tags. Its Content tools menu
also gets Export CSV beside Export Excel, using the same configured export
columns and unfiltered batched fetch as its Excel action.
