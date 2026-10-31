# Keep reviewed maker spelling aliases consistent across imports

The visible-product audit found ten spelling variants attached to unpublished
duplicate maker records, while the same identities already have approved
profiles. Preserve those duplicate records and their moderation decisions;
consolidate verified listing identities and redirect their old public links.

Merchant-scoped `vendor_aliases` already work in both Shopify import paths.
Mister B uses the generic crawler, whose mapper currently ignores that config.
Apply the existing exact vendor resolver to its selected maker name as well.
Keep configured maker priority over extracted names, seller identity, prices,
images and all review decisions unchanged. Malformed alias config is ignored.

Use this narrow mapper repair instead of a global name-based merge or a new
alias registry. Name similarity alone is insufficient to establish identity;
the separate data plan reviews each duplicate against its approved profile.
