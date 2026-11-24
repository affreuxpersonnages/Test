// Serveur de prise de rendez-vous pour salon de coiffure.
// Zéro dépendance : `node server.js` puis http://localhost:3000
// - Interface client  : http://localhost:3000/#reserver
// - Interface pro/dev : http://localhost:3000/#pro
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const PAGE_FILE = path.join(__dirname, 'public', 'index.html');

// ---------- Persistance (fichier JSON) ----------
let state = { config: null, bookings: [] };
try { state = { ...state, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch (_) { /* premier lancement */ }
function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- Règles métier ----------
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const STATUSES = ['confirmed', 'pending', 'cancelled', 'done', 'noshow'];

function overlaps(b) {
  const buf = Number(state.config?.rules?.bufferMin) || 0;
  const s = toMin(b.time), e = s + Number(b.duration);
  return state.bookings.some(x => x.id !== b.id && x.staffId === b.staffId && x.date === b.date && x.status !== 'cancelled' && (() => {
    const xs = toMin(x.time), xe = xs + Number(x.duration);
    return !(e + buf <= xs || s >= xe + buf);
  })());
}
function validateBooking(b) {
  if (!b || typeof b !== 'object') return 'Corps de requête invalide';
  if (!/^[A-Z0-9-]{4,20}$/.test(b.id || '')) return 'id invalide';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return 'date invalide (AAAA-MM-JJ)';
  if (!/^\d{2}:\d{2}$/.test(b.time || '')) return 'heure invalide (HH:MM)';
  if (!(Number(b.duration) > 0)) return 'durée invalide';
  if (!b.staffId || !b.serviceId) return 'staffId et serviceId requis';
  if (!b.client || !String(b.client.name || '').trim() || String(b.client.phone || '').replace(/\D/g, '').length < 10) return 'nom et téléphone client requis';
  if (b.status && !STATUSES.includes(b.status)) return 'statut invalide';
  return null;
}

// ---------- HTTP ----------
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) { reject(new Error('too_large')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('bad_json')); } });
  });
}
function page() {
  // public/index.html est écrit sans squelette (il sert aussi d'artifact) : on l'enveloppe ici.
  const body = fs.readFileSync(PAGE_FILE, 'utf8');
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>' +
    '</head><body>' + body + '</body></html>';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, page(), 'text/html; charset=utf-8');
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && p === '/api/state') return send(res, 200, state);

    if (req.method === 'PUT' && p === '/api/config') {
      const { config } = await readBody(req);
      if (!config || typeof config !== 'object') return send(res, 400, { error: 'invalid', message: 'config manquante' });
      state.config = config; save();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'PUT' && p === '/api/state') {
      const body = await readBody(req);
      state = { config: body.config || null, bookings: Array.isArray(body.bookings) ? body.bookings : [] }; save();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && p === '/api/bookings') {
      const date = url.searchParams.get('date');
      return send(res, 200, state.bookings.filter(b => !date || b.date === date));
    }
    if (req.method === 'POST' && p === '/api/bookings') {
      const b = await readBody(req);
      const err = validateBooking(b);
      if (err) return send(res, 400, { error: 'invalid', message: err });
      if (state.bookings.some(x => x.id === b.id)) return send(res, 409, { error: 'duplicate', message: 'Numéro déjà utilisé' });
      if (overlaps(b)) return send(res, 409, { error: 'slot_taken', message: 'Ce créneau vient d’être pris.' });
      b.status = b.status || 'confirmed';
      b.createdAt = b.createdAt || new Date().toISOString();
      state.bookings.push(b); save();
      return send(res, 201, { ok: true, booking: b });
    }
    if (req.method === 'POST' && p === '/api/bookings/delete') {
      const { ids } = await readBody(req);
      const set = new Set(Array.isArray(ids) ? ids : []);
      const before = state.bookings.length;
      state.bookings = state.bookings.filter(b => !set.has(b.id)); save();
      return send(res, 200, { ok: true, deleted: before - state.bookings.length });
    }
    const m = p.match(/^\/api\/bookings\/([^/]+)$/);
    if (m && req.method === 'PATCH') {
      const b = state.bookings.find(x => x.id === decodeURIComponent(m[1]));
      if (!b) return send(res, 404, { error: 'not_found', message: 'Réservation introuvable' });
      const patch = await readBody(req);
      if (patch.status && !STATUSES.includes(patch.status)) return send(res, 400, { error: 'invalid', message: 'statut invalide' });
      for (const k of ['status', 'cancelledBy', 'updatedAt', 'staffId', 'date', 'time', 'note']) if (k in patch) b[k] = patch[k];
      save();
      return send(res, 200, { ok: true, booking: b });
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'not_found', message: 'Route inconnue' });
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  } catch (e) {
    send(res, 400, { error: e.message || 'error', message: 'Requête invalide' });
  }
});

server.listen(PORT, () => {
  console.log(`Salon RDV prêt sur http://localhost:${PORT}`);
  console.log(`  Client  : http://localhost:${PORT}/#reserver`);
  console.log(`  Pro/dev : http://localhost:${PORT}/#pro`);
});
