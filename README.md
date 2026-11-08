# Raestyle

Personal styling hub, digital wardrobe manager and outfit planner. A single-file PWA, installed to the iPhone home screen and synced across devices.

## Layout

- `public/` – the site Cloudflare Pages serves
  - `index.html` – the whole app (HTML, CSS, JS)
  - `sw.js` – service worker for offline use (never caches `/api`)
  - `manifest.webmanifest`, `icon-*.png` – home-screen install
  - `_headers` – no-cache on the shell so updates land
- `functions/api/[[path]].js` – sync API (sign-in, state, photos), backed by Cloudflare D1

## How sync works

- Each device keeps a full copy in IndexedDB, so the app opens instantly and works offline.
- Changes upload about 1.5s after you stop editing. The app pulls when it opens, when it comes back to the foreground, and every 30s while it's open.
- The whole wardrobe is one JSON document with a revision number. Photos are stored separately, once each, by SHA-256.
- If two devices edit at once, changes are merged item by item. When both devices changed the same item, the last one saved wins.
- Signing in issues a 90-day token per device. Changing `PASSWORD` signs out every device.

## Cloudflare Pages setup

Settings → Build:
- Build command: none
- Build output directory: `public`

Settings → Bindings → add **D1 database**, variable name `DB`. Tables are created automatically on first request.

Settings → Variables and Secrets (type **Secret**, Production):
- `PASSWORD` – what you type to sign in. Use a long one.
- `SESSION_SECRET` – a long random string (`openssl rand -base64 32`)

Every push to `main` deploys. When shipping changes, bump `CACHE` in `public/sw.js`.

## Run locally

```sh
printf 'PASSWORD=test-pass\nSESSION_SECRET=dev\n' > .dev.vars
npx wrangler pages dev public --d1 DB
```

Then open http://localhost:8788. The local database lives in `.wrangler/` (gitignored).
