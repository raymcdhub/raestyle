# Raestyle

Personal styling hub, digital wardrobe manager and outfit planner. A single-file PWA installed to the iPhone home screen.

## Files

- `index.html` – the whole app (HTML, CSS, JS)
- `sw.js` – service worker for offline use
- `manifest.webmanifest`, `icon-*.png` – home-screen install
- `_headers` – Cloudflare Pages headers (no-cache on the shell so updates land)

## Data

Everything is stored on the device in IndexedDB (localStorage fallback), keyed to the site's origin. Nothing is sent to a server.

- Use **Export backup** in the app regularly; the backup file is the only copy outside the phone.
- Don't change the deploy domain. A new domain is a new origin and starts with an empty wardrobe (restore with Import).

## Deploy

Hosted on Cloudflare Pages, connected to this repo. Every push to `main` deploys.

- Build command: none
- Output directory: `/`

When shipping changes, bump `CACHE` in `sw.js` (e.g. `raestyle-v3`) so old cached files are cleared.

## Run locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. The service worker only registers over HTTPS, so offline mode is only testable on the deployed site.
