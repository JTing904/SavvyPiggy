
# SavvyPiggy

A free Android app that gives every ringgit a place to go. Put in one amount and it is split across
your goals by the percentages you set, in whole cents, always rounded down. Around that sit a wallet
for money you can spend, bills and debts, receipts, and a separate investing side for Bursa shares.

**Website:** https://jting904.github.io/SavvyPiggy · **Download:** [latest release](https://github.com/JTing904/SavvyPiggy/releases/latest)

SavvyPiggy never connects to a bank and never asks for payment details. It is a record of money you
have already set aside yourself. No ads, no analytics, open source. Signing in needs an invite code.

## What it does

**Saving**

- **Percentage split** — each goal takes a share of every deposit; one entry feeds them all.
- **Cent-exact maths** — every calculation runs in integer cents and floors; the odd leftover cent
  goes to the largest share, so a split can never total more than was deposited.
- **Wallet** — income lands in a wallet of money you can spend; you decide how much moves on to the
  goals. Spending more than the wallet holds shows as overdrawn, and the next income fills that first.
- **Overflow** — optionally, a goal that reaches its target stops taking a cut and hands its share to
  the goals still short of theirs.
- **Automatic deposits and bills** — daily, weekly or monthly rules, and fixed or variable bills with
  a reminder the day before. There is no server, so occurrences missed while the phone was off are
  reconstructed when the app is next opened.
- **Debts and loans** — borrowed money never lands in a goal. It is recorded as debt, interest is
  worked out for you, and the next deposits clear it before anything is split. A net-worth view sits
  beside it.
- **Receipts** — attach a photo to an entry, or take one and let the text be read on the phone
  (offline, Google ML Kit). Keeping the photo is optional.

**Looking back**

- **Report & statements** — week to all-time views, budgets, streaks and a forecast, plus a monthly
  statement as a PDF or an Excel workbook (.xlsx), built on the device.
- **Export everything** — one JSON file with goals, records, wallet, debts, bills, investing and
  settings (no photos), handed to the system share sheet. Nothing is uploaded.
- **Data retention** — history is kept for 6 or 12 months (your choice). Older entries are cleared
  only after their months have been listed on the Statements screen and a statement has been saved
  from it; their receipt photos go with them. Balances never change.

**Investing** (kept apart from savings, never added to the total)

- **Trades** — a dated log for Bursa counters with broker fees counted into the cost; positions are
  worked out from the log.
- **Dividends** — ex-dates and pay dates come from a small Cloudflare Worker ([`worker/`](worker)) that
  reads public announcements and caches them per counter. A dividend is credited to the investment pot
  on its pay date, once, and only when the announcement could actually be read.
- **Investment pot** — buys come out of it; sales and dividends go back into it. Money moves in from a
  goal and back to savings by hand.
- **Monthly pick** — one counter chosen from your own watchlist, weighted by six style questions you
  answer, with its past hit rate against a random pick shown beside it. It is not financial advice.

**The app itself**

- **Light, dark, English, 中文** — follows the phone or your choice; statements and notifications follow
  the language too.
- **Invite codes made in the app** — the admin account can make a single-use code that works for
  10 minutes, shown as text and a QR code; the other person scans it with Google's own scanner (no camera
  permission).
- **Local notifications** — reminders and milestones are scheduled by the phone itself, never pushed
  from a server, and cancelled when you sign out.

## Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS (bundled at build time via PostCSS) · Capacitor 8 ·
Firebase Auth + Cloud Firestore · Cloudflare Workers (dividend dates).
Everything runs on free tiers: no Cloud Functions, no paid features.

## Running it yourself

```bash
npm install
cp .env.local.example .env.local     # fill in from your own Firebase project
npm run dev                          # browser
npm test                             # unit tests for the money rules
npm run android:apk                  # debug APK on a connected device
```

`android/app/google-services.json` is not in this repository — download your own from the Firebase
console. Same for `.env.local`.

Firestore access rules live in [`firestore.rules`](firestore.rules): a signed-in user can read and
write nothing but their own documents, and only after redeeming an invite code. The server also
refuses any write that would leave the investment pot below zero, so a stale offline phone cannot
overspend it, and a code made in the app stops working after ten minutes. Rules are deployed with
`npm run deploy:rules`; the dividend Worker with `wrangler deploy` from [`worker/`](worker).

## Tests

`npm test` bundles each file in [`tests/`](tests) and runs it on plain Node. The money rules
(splitting, rounding, debt repayment, archiving, analytics, exports, notification scheduling, trade
money and the investment pot, dividends, fees, invite codes, the monthly pick) are covered there —
about 2,000 assertions at the time of writing. `npm run test:rules` checks `firestore.rules` against
the Firestore emulator (needs Java). Both, plus a type check and a build, run on every push in
[GitHub Actions](.github/workflows/ci.yml).

## Releases

APKs are signed with a release key that is **not** in this repository. `android/keystore.properties`
and the keystore file itself are ignored by git.

## Licence

MIT — see [LICENSE](LICENSE).

© 2026 Edward JT · kengtingtan@gmail.com
