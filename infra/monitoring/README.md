# OONI Monitoring for queer.guide

## What is OONI?

The [Open Observatory of Network Interference](https://ooni.org) (OONI) is a free software project that measures internet censorship worldwide. Community members can help track whether queer.guide is being blocked in their country.

## How to Help

### 1. Install OONI Probe

- **Android:** [Google Play](https://play.google.com/store/apps/details?id=org.openobservatory.ooniprobe) or [F-Droid](https://f-droid.org/packages/org.openobservatory.ooniprobe/)
- **iOS:** [App Store](https://apps.apple.com/app/ooni-probe/id1199566366)
- **Desktop:** [ooni.org/install](https://ooni.org/install/)

### 2. Test queer.guide

Open OONI Probe and test these URLs:
- `https://queer.guide/`
- `https://queer.guide/venues`
- `https://queer.guide/events`
- `https://queer.guide/resources`
- `https://queer.guide/help-hotlines`

### 3. View Results

Results are published automatically to [OONI Explorer](https://explorer.ooni.org/search?domain=queer.guide).

## Contributing to Test Lists

The file `ooni-test-list.csv` follows the [Citizen Lab test list format](https://github.com/citizenlab/test-lists). To add queer.guide to a country's official test list:

1. Fork [citizenlab/test-lists](https://github.com/citizenlab/test-lists)
2. Add rows from `ooni-test-list.csv` to the relevant country CSV in `lists/`
3. Submit a pull request

Priority countries (known LGBTQ+ content blocking):
Russia, Iran, Saudi Arabia, UAE, Uganda, Ghana, Nigeria, Egypt, Indonesia, Malaysia, Pakistan, Iraq, Tunisia
