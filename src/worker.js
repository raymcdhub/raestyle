// Raestyle Worker: serves public/ as static assets, plus the sync API under /api (D1 bound as DB).
// Secrets: PASSWORD (what you type to sign in), SESSION_SECRET (long random string).
//
// POST /api/login        {password}            -> {token}
// GET  /api/state?rev=N                        -> {rev, data} (data left out if rev is unchanged)
// PUT  /api/state        {base, data}          -> {rev}  | 409 {rev, data}
// PUT  /api/img/:id      data URL as text      -> 204
// GET  /api/img/:id                            -> data URL as text

const SESSION_DAYS = 90;
const enc = new TextEncoder();

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

let ready = null;
function migrate(db) {
  if (!ready) ready = db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), rev INTEGER NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, data TEXT NOT NULL)'),
  ]).catch(e => { ready = null; throw e; });
  return ready;
}

async function hmac(env, msg) {
  // signing key includes the password, so changing PASSWORD signs out every device
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET + '|' + env.PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function same(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}

async function authed(request, env) {
  const m = /^Bearer (\d+)\.([\w-]+)$/.exec(request.headers.get('authorization') || '');
  if (!m || Number(m[1]) < Date.now()) return false;
  return same(m[2], await hmac(env, 'raestyle:' + m[1]));
}

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    // static files are matched before the Worker runs; anything else outside /api is the app shell
    return pathname.startsWith('/api/') ? api(request, env, pathname.slice(5)) : env.ASSETS.fetch(request);
  },
};

async function api(request, env, path) {
  const missing = ['DB', 'PASSWORD', 'SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) return json({ error: 'Server not configured: missing ' + missing.join(', ') }, 500);
  const method = request.method;

  if (path === 'login' && method === 'POST') {
    const { password = '' } = await request.json().catch(() => ({}));
    // compare HMACs so the check takes the same time whatever was typed
    if (!same(await hmac(env, 'pw:' + password), await hmac(env, 'pw:' + env.PASSWORD))) {
      await new Promise(r => setTimeout(r, 1000));
      return json({ error: 'Wrong password' }, 401);
    }
    const exp = Date.now() + SESSION_DAYS * 864e5;
    return json({ token: exp + '.' + await hmac(env, 'raestyle:' + exp) });
  }

  if (!(await authed(request, env))) return json({ error: 'Signed out' }, 401);
  await migrate(env.DB);

  if (path === 'state' && method === 'GET') {
    // ?rev=N: skip sending the data if the device already has that revision
    const have = Number(new URL(request.url).searchParams.get('rev'));
    const cur = await env.DB.prepare('SELECT rev FROM state WHERE id = 1').first();
    if (!cur) return json({ rev: 0, data: null });
    if (have && cur.rev === have) return json({ rev: cur.rev });
    return json(await env.DB.prepare('SELECT rev, data FROM state WHERE id = 1').first());
  }

  if (path === 'state' && method === 'PUT') {
    const { base, data } = await request.json().catch(() => ({}));
    if (typeof data !== 'string' || !Number.isInteger(base)) return json({ error: 'Bad request' }, 400);
    if (data.length > 1_900_000) return json({ error: 'Too large' }, 413);
    // only write if nobody else saved since this device last synced
    const r = base === 0
      ? await env.DB.prepare('INSERT OR IGNORE INTO state (id, rev, data, updated) VALUES (1, 1, ?, ?)').bind(data, Date.now()).run()
      : await env.DB.prepare('UPDATE state SET rev = rev + 1, data = ?, updated = ? WHERE id = 1 AND rev = ?').bind(data, Date.now(), base).run();
    if (r.meta.changes === 1) return json({ rev: base + 1 });
    const row = await env.DB.prepare('SELECT rev, data FROM state WHERE id = 1').first();
    return json(row || { rev: 0, data: null }, 409);
  }

  const img = /^img\/([a-f0-9]{64})$/.exec(path);
  if (img && method === 'PUT') {
    const data = await request.text();
    if (!data.startsWith('data:image/') || data.length > 1_900_000) return json({ error: 'Bad image' }, 400);
    await env.DB.prepare('INSERT OR IGNORE INTO images (id, data) VALUES (?, ?)').bind(img[1], data).run();
    return new Response(null, { status: 204 });
  }
  if (img && method === 'GET') {
    const row = await env.DB.prepare('SELECT data FROM images WHERE id = ?').bind(img[1]).first();
    return row ? new Response(row.data, { headers: { 'content-type': 'text/plain', 'cache-control': 'private, max-age=31536000, immutable' } })
      : json({ error: 'Not found' }, 404);
  }

  return json({ error: 'Not found' }, 404);
}
