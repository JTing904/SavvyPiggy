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
- **Report & exports** — week to all-time views, allocation ring, streaks, forecast, and PDF or CSV
  export of any period. The PDF is rendered on-device so Chinese goal names come out right.
- **Local notifications** — reminders and milestones are scheduled by the phone itself, never pushed
  from a server.

## Stack

React 19 · TypeScript · Vite 6 · Tailwind (CDN) · Capacitor 8 · Firebase Auth + Cloud Firestore.
Everything runs on Firebase's free tier: no Cloud Functions, no paid features.

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
write nothing but their own documents, and only after redeeming an invite code.

## Tests

`npm test` bundles each file in [`tests/`](tests) and runs it on plain Node. The money rules
(splitting, rounding, debt repayment, archiving, analytics, exports, notification scheduling) are
covered there — 189 assertions at the time of writing.

## Releases

APKs are signed with a release key that is **not** in this repository. `android/keystore.properties`
and the keystore file itself are ignored by git.

## Licence

MIT — see [LICENSE](LICENSE).

© 2026 Edward JT · kengtingtan@gmail.com
