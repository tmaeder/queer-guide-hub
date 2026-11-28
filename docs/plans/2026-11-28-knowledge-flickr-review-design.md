# Licensed Flickr portraits in human review

The existing knowledge review action accepts only Commons images, preventing review of a documented Flickr portrait. Extend the existing action to a second explicitly supported source rather than adding a parallel approval route or allowing arbitrary image hosts.

Flickr candidates must identify a canonical HTTPS photo page and a matching photo ID on live.staticflickr.com. Accept exact CC BY, CC BY-SA or CC0 labels with their corresponding Creative Commons licence URLs, plus the original title, change declaration, licence documentation and image receipt hash. Continue requiring the existing creator, attribution, alt text, caption, minimum dimensions, authenticated moderator and explicit subject-and-rights attestation. Licence metadata records evidence for human review; it is not independent proof of the uploader's rights.

Store the actual source as flickr and retain the full approved portrait metadata with the private image asset, including licence link and supplied copyright/credit notices. Preserve Commons support and the separate article approval/publication actions. The current admin source link and approval action need no frontend change.

Test source and licence rejection, ID mismatches, missing evidence, non-reviewer/service-role denial, internal asset provenance, Commons compatibility and no public article/image mutation on image approval. Deployment changes workflow code only. All thirty pilot entries remain unapproved drafts, their image candidates remain unapproved, and both automation controls remain disabled.
