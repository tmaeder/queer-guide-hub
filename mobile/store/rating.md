# Age ratings

The platform is 18+ (sign-up requires the 18+ attestation in
`src/app/auth.tsx`). The native app itself contains no dating or intimate
features, no user-generated content feed and no chat — but its listings
include saunas, cruising venues and fetish clubs, described factually.

## App Store questionnaire

| Question | Answer |
|---|---|
| Mature/suggestive themes | Infrequent/Mild |
| Sexual content or nudity | None (venue descriptions are text, no imagery of nudity) |
| Alcohol, tobacco, drug use or references | Frequent/Intense (bars and clubs are core content) |
| Gambling, horror, violence, profanity | None |
| Unrestricted web access | No (links open specific websites in the system browser) |
| User-generated content | No (not in the app) |

Apple derives **17+** from the alcohol answer alone, which also matches the
platform's 18+ rule better than 12+ would. **DECISION:** keep 17+; do not
answer "None" on mature themes to reach a lower band.

## IARC (Play)

Same facts: references to alcohol and adult venues, no sexual imagery, no
user interaction between users in the app, no location sharing between users,
no purchases. Expect **PEGI 16 / ESRB Mature 17+ / USK 16**; set the Play
target audience to **18+ only** regardless of the computed rating.
