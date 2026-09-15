# SavvyPiggy

An Android savings tracker that splits every deposit across your goals by the percentages you set.
Put in one amount, and every goal gets its share — worked out in whole cents, always rounded down.

**Website:** https://jting904.github.io/SavvyPiggy · **Download:** [latest release](https://github.com/JTing904/SavvyPiggy/releases/latest)

SavvyPiggy never connects to a bank and never asks for payment details. It is a record of money you
have already set aside yourself. Signing in needs an invite code.

## What it does

- **Percentage split** — each goal takes a share of every deposit; one entry feeds them all.
- **Cent-exact maths** — every calculation runs in integer cents and floors; the odd leftover cent
  goes to the largest share, so a split can never total more than was deposited.
- **Overflow** — optionally, a goal that reaches its target stops taking a cut and hands its share to
  the goals still short of theirs.
- **Borrowing** — borrowed money never lands in a goal. It is recorded as debt and cleared by the
  next deposits before anything is split.
- **Automatic deposits** — daily/weekly/monthly rules. There is no server, so occurrences missed
  while the phone was off are reconstructed when the app is next opened.
- **Report & statements** — week to all-time views, allocation ring, streaks and forecast, plus a
  monthly statement for each month as a PDF or an Excel workbook (.xlsx). Both are built on-device;
  the PDF is rendered there so Chinese goal names come out right.
- **Data retention** — History is kept for 6 or 12 months (your choice). Older entries are cleared
  only after their months have been listed on the Statements screen for export; balances never change.
- **Investing** — a dated trade log for Bursa counters with contract-note fees, prices, dividends and a
  Growth screen with a month-by-month chart. Buys come out of an **investment pot**; sales and
  dividends go back into it. Money moves into the pot from a goal and back to savings by hand, and the
  pot is never counted in total savings.
- **Dividends** — ex-dates and pay dates come from a small Cloudflare Worker ([`worker/`](worker)) that
  reads public announcements and caches them per counter. A dividend is credited to the pot on its pay
  date, once, and only when the announcement could actually be read.
- **Recommendation** — a pick from your own watchlist, weighted by the style questions, with its past
  hit rate against a random pick shown beside it. It is not financial advice.
- **English / 中文** — the whole app, its statements and notifications switch language; the choice is
  asked on first launch and can be changed later.
- **Local notifications** — reminders and milestones are scheduled by the phone itself, never pushed
  from a server.

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
overspend it. Rules are deployed with `npm run deploy:rules`; the dividend Worker with `wrangler deploy`
from [`worker/`](worker).

## Tests

`npm test` bundles each file in [`tests/`](tests) and runs it on plain Node. The money rules
(splitting, rounding, debt repayment, archiving, analytics, exports, notification scheduling, trade
money and the investment pot, dividends, fees, the recommendation) are covered there — over 900
assertions at the time of writing. `npm run test:rules` checks `firestore.rules` against the
Firestore emulator (needs Java).

## Releases

APKs are signed with a release key that is **not** in this repository. `android/keystore.properties`
and the keystore file itself are ignored by git.

## Licence

MIT — see [LICENSE](LICENSE).

© 2026 Edward JT · kengtingtan@gmail.com
