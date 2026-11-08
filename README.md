# Raestyle

Personal styling hub, digital wardrobe manager and outfit planner. A single-file PWA, installed to the iPhone home screen and synced across devices.

## Layout

- `public/` – static files the Worker serves
  - `index.html` – the whole app (HTML, CSS, JS)
  - `sw.js` – service worker for offline use (never caches `/api`)
  - `manifest.webmanifest`, `icon-*.png` – home-screen install
  - `_headers` – no-cache on the shell so updates land
- `src/worker.js` – Worker: serves `public/`, plus the sync API under `/api` (sign-in, state, photos), backed by Cloudflare D1
- `wrangler.jsonc` – Worker config (name, assets, D1 binding)

## How sync works

- Each device keeps a full copy in IndexedDB, so the app opens instantly and works offline.
- Changes upload about 1.5s after you stop editing. The app pulls when it opens, when it comes back to the foreground, and every 30s while it's open.
- The whole wardrobe is one JSON document with a revision number. Photos are stored separately, once each, by SHA-256.
- If two devices edit at once, changes are merged item by item. When both devices changed the same item, the last one saved wins.
- Signing in issues a 90-day token per device. Changing `PASSWORD` signs out every device.

## Cloudflare setup (Worker with static assets)

Config lives in `wrangler.jsonc`. In the dashboard:

1. Storage & Databases → D1 → create `raestyle`, and copy its ID into `database_id` in `wrangler.jsonc`. Tables are created automatically on first request.
2. Worker → Settings → Variables and Secrets, add as **Secret**:
   - `PASSWORD` – what you type to sign in. Use a long one.
   - `SESSION_SECRET` – a long random string (`openssl rand -base64 32`)
3. Worker → Settings → Build: deploy command `npx wrangler deploy`, no build command, root directory `/`.

Every push to `main` deploys. When shipping changes, bump `CACHE` in `public/sw.js`.

## Run locally

```sh
printf 'PASSWORD=test-pass\nSESSION_SECRET=dev\n' > .dev.vars
npx wrangler dev
```

Then open http://localhost:8788. The local database lives in `.wrangler/` (gitignored).
