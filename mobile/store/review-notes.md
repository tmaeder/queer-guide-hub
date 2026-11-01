# Notes for App Review / Play review

**What the app is.** A map of LGBTQIA+ venues and a list of LGBTQIA+ crisis
and support lines, from queer.guide. Browsing, search, saving places, the Help
tab and offline city downloads all work **without an account**.

**Account.** Optional. Demo account for review:
`<create review@queer.guide in Supabase Auth before submission>` /
`<password in 1Password, not in this repo>`. Account deletion: Me → Account →
Delete account (guideline 5.1.1(v)).

**Things that may look like bugs and are not:**
- Some venues are shown only to signed-in users. In countries that
  criminalise same-sex relationships, listing those places publicly is a
  safety risk to the people who go there. Signing in with the demo account
  shows them.
- The Help tab never labels a general directory as a crisis line, and states
  for each line whether it says it may contact police. This is intentional.
- Location is optional; the app is fully usable after denying it.

**Encryption.** Standard HTTPS only — `ITSAppUsesNonExemptEncryption = false`.

**Contact for review:** <name, phone, email — DECISION: who answers>
