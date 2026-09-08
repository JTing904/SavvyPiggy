# SavvyPiggy dividend service

A single Cloudflare Worker that reads Bursa dividend announcements and hands
the app a few kilobytes of JSON. It exists because there is no free API for
this: Yahoo has the prices but leaves `dividendDate` empty for Malaysian
counters, and Bursa's own site turns scrapers away. KLSE Screener's stock pages
render the dates server-side, so that is where they come from.

It stores nothing about anyone. It knows which counters have been asked about;
units, amounts and the money itself never leave the phone.

Everything here fits inside Cloudflare's free plan.

## Deploying it

From this directory:

```sh
npm install -g wrangler          # or npx wrangler for each command
wrangler login                   # opens the browser once

wrangler kv namespace create DIVIDENDS
# paste the id it prints into wrangler.toml, replacing PASTE_KV_NAMESPACE_ID_HERE

wrangler deploy
```

`wrangler deploy` prints the address, something like
`https://savvypiggy-dividends.<your-subdomain>.workers.dev`. Put that in the
app's `.env.local`:

```
VITE_DIVIDENDS_API=https://savvypiggy-dividends.<your-subdomain>.workers.dev
```

then rebuild the app (`npm run android:apk`). Until that line is set the app
fetches nothing and credits nothing, and the Dividends screen says so.

## Checking it

```sh
curl https://<your-worker>/health
# {"ok":true}

curl "https://<your-worker>/dividends?symbols=1155"
# {"error":"unauthorized"}  — expected: it only answers signed-in app users
```

The `unauthorized` is the point. Every request must carry a live Firebase ID
token for the project named in `wrangler.toml`, so the endpoint cannot be used
by anyone else as a proxy to the source site.

To see what the parser makes of the live pages without deploying anything:

```sh
npm run dividends:check          # from the repo root
```

## When it breaks

It will, eventually — it reads a web page nobody promised to keep stable. The
parser checks the table's own headings before it trusts a row, so a redesign
makes it return nothing rather than nonsense. That is deliberate: the app then
records no dividends, which is a nuisance. Recording a wrong one would be a lie
in someone's savings.

`services/dividends.ts` holds the parser and its tests (`npm test`). Fixing it
there and redeploying the Worker fixes every phone at once, with no app update.
