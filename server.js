const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const STORE = path.join(ROOT, 'voice-passport-data.json');
const voice = { id: 'VOICE-001', name: 'Creator Voice #01', creator: 'Demo Creator', status: 'ACTIVE' };
const permissions = [
  { id: 'PERM-001', label: 'Game dialogue', status: 'ALLOWED', tone: 'positive' },
  { id: 'PERM-002', label: 'Personal projects', status: 'ALLOWED', tone: 'positive' },
  { id: 'PERM-003', label: 'AI model training', status: 'DENIED', tone: 'negative' },
  { id: 'PERM-004', label: 'Resale', status: 'DENIED', tone: 'negative' },
  { id: 'PERM-005', label: 'Political advertising', status: 'DENIED', tone: 'negative' },
  { id: 'PERM-006', label: 'Commercial advertising', status: 'REQUIRES APPROVAL', tone: 'warning' }
];

function seed() {
  return {
    voice, permissions,
    requests: [
      { id: 'REQ-GAME-2048', voice_id: voice.id, requester: 'GameStudio AI', purpose: 'Game character dialogue', requested_action: 'Synthetic voice generation', duration: 90, model_training: false, resale: false, status: 'PENDING', created_at: new Date().toISOString() },
      { id: 'REQ-AD-2051', voice_id: voice.id, requester: 'AdStudio AI', purpose: 'Commercial advertising', requested_action: 'Synthetic voice generation for advertisement', duration: 30, model_training: false, resale: false, status: 'PENDING', created_at: new Date(Date.now() - 3600000).toISOString() }
    ],
    authorizations: [], receipts: []
  };
}
function db() { if (!fs.existsSync(STORE)) fs.writeFileSync(STORE, JSON.stringify(seed(), null, 2)); return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
function save(data) { fs.writeFileSync(STORE, JSON.stringify(data, null, 2)); }
function send(res, status, body, type = 'application/json') { res.writeHead(status, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); }
function receiptId() { return `VPR-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function expired(auth) { return auth.status === 'ACTIVE' && new Date(auth.expires_at) <= new Date(); }
function normalize(data) { data.authorizations.forEach(a => { if (expired(a)) a.status = 'EXPIRED'; }); return data; }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return send(res, 200, fs.readFileSync(path.join(ROOT, 'index.html')), 'text/html');
  if (req.method === 'GET' && url.pathname === '/app.js') return send(res, 200, fs.readFileSync(path.join(ROOT, 'app.js')), 'application/javascript');
  if (req.method === 'GET' && url.pathname === '/styles.css') return send(res, 200, fs.readFileSync(path.join(ROOT, 'styles.css')), 'text/css');
  let data = normalize(db());
  if (req.method === 'GET' && url.pathname === '/api/state') { save(data); return send(res, 200, data); }
  if (req.method === 'GET' && url.pathname === '/api/voices/VOICE-001') return send(res, 200, data.voice);
  if (req.method === 'GET' && url.pathname === '/api/permissions') return send(res, 200, data.permissions);
  if (req.method === 'GET' && url.pathname === '/api/requests') return send(res, 200, data.requests);
  if (req.method === 'GET' && url.pathname === '/api/authorizations') return send(res, 200, data.authorizations);
  if (req.method === 'GET' && url.pathname === '/api/receipts') return send(res, 200, data.receipts);
  const approval = url.pathname.match(/^\/api\/requests\/([^/]+)\/(approve|deny)$/);
  if (req.method === 'POST' && approval) {
    const request = data.requests.find(x => x.id === approval[1]);
    if (!request) return send(res, 404, { error: 'Request not found' });
    if (request.status !== 'PENDING') return send(res, 409, { error: 'Request already decided' });
    const approve = approval[2] === 'approve';
    request.status = approve ? 'APPROVED' : 'DENIED';
    let authorization = null;
    if (approve) {
      authorization = { id: `AUTH-${randomUUID().slice(0, 8).toUpperCase()}`, request_id: request.id, voice_id: voice.id, requester: request.requester, purpose: request.purpose, scope: request.requested_action, expires_at: new Date(Date.now() + request.duration * 86400000).toISOString(), status: 'ACTIVE', created_at: new Date().toISOString(), revoked_at: null };
      data.authorizations.unshift(authorization);
    }
    const receipt = { id: receiptId(), request_id: request.id, authorization_id: authorization?.id || null, decision: request.status, reason: approve ? 'Purpose is permitted under this Voice Passport.' : 'Commercial advertising is not currently authorized.', timestamp: new Date().toISOString() };
    data.receipts.unshift(receipt); save(data); return send(res, 200, { request, authorization, receipt });
  }
  const revoke = url.pathname.match(/^\/api\/authorizations\/([^/]+)\/revoke$/);
  if (req.method === 'POST' && revoke) {
    const authorization = data.authorizations.find(x => x.id === revoke[1]);
    if (!authorization) return send(res, 404, { error: 'Authorization not found' });
    if (authorization.status !== 'ACTIVE') return send(res, 409, { error: 'Authorization is not active' });
    authorization.status = 'REVOKED'; authorization.revoked_at = new Date().toISOString(); save(data); return send(res, 200, authorization);
  }
  if (req.method === 'POST' && url.pathname === '/api/reset') { const fresh = seed(); save(fresh); return send(res, 200, fresh); }
  send(res, 404, { error: 'Not found' });
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Voice Passport running on port ${PORT}`);
});
