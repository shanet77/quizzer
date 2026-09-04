const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'quizzer.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  takes INTEGER NOT NULL DEFAULT 0,
  edit_token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_options_q ON options(question_id);
CREATE INDEX IF NOT EXISTS idx_results_quiz ON results(quiz_id);
`);

function genId() {
  return crypto.randomBytes(6).toString('base64url');
}

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

function isSafeImageUrl(s) {
  if (!s) return true;
  if (typeof s !== 'string' || s.length > 2048) return false;
  const v = s.trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function str(v, min, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t.length < min || t.length > max) return null;
  return t;
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return { error: 'Bad payload' };
  if (body.website && String(body.website).trim() !== '') return { error: 'Spam rejected' };
  const title = str(body.title, 3, 120);
  if (!title) return { error: 'Title must be 3-120 chars' };
  let description = '';
  if (body.description) {
    const d = str(body.description, 1, 280);
    if (body.description.trim() !== '' && !d) return { error: 'Description max 280 chars' };
    description = d || '';
  }
  if (!Array.isArray(body.results) || body.results.length < 2 || body.results.length > 4)
    return { error: 'Need 2-4 results' };
  if (!Array.isArray(body.questions) || body.questions.length < 2 || body.questions.length > 8)
    return { error: 'Need 2-8 questions' };
  const results = [];
  for (const r of body.results) {
    const rt = str(r.title, 2, 80);
    if (!rt) return { error: 'Each result needs a 2-80 char title' };
    let rd = '';
    if (r.description && String(r.description).trim() !== '') {
      rd = str(r.description, 1, 280);
      if (!rd) return { error: 'Result description max 280 chars' };
    }
    const img = r.imageUrl ? String(r.imageUrl).trim() : '';
    if (!isSafeImageUrl(img)) return { error: 'Result images must be https URLs' };
    results.push({ title: rt, description: rd, imageUrl: img });
  }
  const questions = [];
  for (const q of body.questions) {
    const qt = str(q.text, 3, 200);
    if (!qt) return { error: 'Each question needs 3-200 chars' };
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4)
      return { error: 'Each question needs 2-4 options' };
    const opts = [];
    for (const o of q.options) {
      const ot = str(o.text, 1, 80);
      if (!ot) return { error: 'Each option needs 1-80 chars' };
      const img = o.imageUrl ? String(o.imageUrl).trim() : '';
      if (!isSafeImageUrl(img)) return { error: 'Option images must be https URLs' };
      const ri = Number(o.resultIndex);
      if (!Number.isInteger(ri) || ri < 0 || ri >= results.length)
        return { error: 'Each option must point at a result' };
      opts.push({ text: ot, imageUrl: img, resultIndex: ri });
    }
    questions.push({ text: qt, options: opts });
  }
  return { title, description, results, questions };
}

const insertQuiz = db.prepare('INSERT INTO quizzes(id,title,description,edit_token_hash,created_at) VALUES(?,?,?,?,?)');
const insertResult = db.prepare('INSERT INTO results(quiz_id,title,description,image_url,position) VALUES(?,?,?,?,?)');
const insertQuestion = db.prepare('INSERT INTO questions(quiz_id,text,position) VALUES(?,?,?)');
const insertOption = db.prepare('INSERT INTO options(question_id,text,image_url,result_id) VALUES(?,?,?,?)');

const createQuizTx = db.transaction((id, tokenHash, data) => {
  insertQuiz.run(id, data.title, data.description, tokenHash, Date.now());
  const resultIds = data.results.map((r, i) => insertResult.run(id, r.title, r.description, r.imageUrl, i).lastInsertRowid);
  data.questions.forEach((q, qi) => {
    const qid = insertQuestion.run(id, q.text, qi).lastInsertRowid;
    for (const o of q.options) insertOption.run(qid, o.text, o.imageUrl, resultIds[o.resultIndex]);
  });
  return resultIds;
});

const replaceQuizTx = db.transaction((id, data) => {
  db.prepare('DELETE FROM questions WHERE quiz_id=?').run(id);
  db.prepare('DELETE FROM results WHERE quiz_id=?').run(id);
  const resultIds = data.results.map((r, i) => insertResult.run(id, r.title, r.description, r.imageUrl, i).lastInsertRowid);
  data.questions.forEach((q, qi) => {
    const qid = insertQuestion.run(id, q.text, qi).lastInsertRowid;
    for (const o of q.options) insertOption.run(qid, o.text, o.imageUrl, resultIds[o.resultIndex]);
  });
});

function getQuizFull(id) {
  const quiz = db.prepare('SELECT id,title,description,takes,created_at FROM quizzes WHERE id=?').get(id);
  if (!quiz) return null;
  const results = db.prepare('SELECT id,title,description,image_url AS imageUrl FROM results WHERE quiz_id=? ORDER BY position').all(id);
  const questions = db.prepare('SELECT id,text FROM questions WHERE quiz_id=? ORDER BY position').all(id);
  const optStmt = db.prepare('SELECT id,text,image_url AS imageUrl,result_id AS resultId FROM options WHERE question_id=?');
  for (const q of questions) q.options = optStmt.all(q.id);
  return { ...quiz, createdAt: quiz.created_at, results, questions };
}

function seedDemo() {
  const n = db.prepare('SELECT COUNT(*) AS c FROM quizzes').get().c;
  if (n > 0) return;
  const id = 'demo0001';
  const tokenHash = hashToken('demo-edit-token');
  try {
    insertQuiz.run(id, 'Which 2014 Internet Era Are You?', 'A deeply scientific 3-question diagnosis.', tokenHash, Date.now());
    const r1 = insertResult.run(id, 'Vine Loop Legend', 'You peak in 6 seconds.', '', 0).lastInsertRowid;
    const r2 = insertResult.run(id, 'BuzzFeed Quiz Addict', 'You have taken this quiz 14 times.', '', 1).lastInsertRowid;
    const q1 = insertQuestion.run(id, 'Pick a snack:', 0).lastInsertRowid;
    insertOption.run(q1, 'Dunkaroos', '', r1);
    insertOption.run(q1, 'Cake in a mug', '', r2);
    const q2 = insertQuestion.run(id, 'Pick a Friday night:', 1).lastInsertRowid;
    insertOption.run(q2, 'Filming Vines', '', r1);
    insertOption.run(q2, 'Taking quizzes about yourself', '', r2);
  } catch {}
}
seedDemo();

const buckets = new Map();
function createAllowed(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { count: 0, reset: now + 3600000 };
  if (now > b.reset) { b.count = 0; b.reset = now + 3600000; }
  b.count += 1;
  buckets.set(ip, b);
  return b.count <= 20;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 600000).unref();

async function build() {
  const fastify = require('fastify')({ logger: false, bodyLimit: 51200, trustProxy: true });
  await fastify.register(require('@fastify/static'), { root: path.join(__dirname, 'public'), wildcard: false, index: false });

  fastify.get('/', (req, reply) => reply.sendFile('index.html'));
  fastify.get('/create', (req, reply) => reply.sendFile('create.html'));
  fastify.get('/health', async () => ({ ok: true }));

  fastify.get('/api/stats', async () => {
    const r = db.prepare('SELECT COUNT(*) AS q, COALESCE(SUM(takes),0) AS t FROM quizzes').get();
    return { totalQuizzes: r.q, totalTakes: r.t };
  });

  fastify.get('/api/quizzes/:id', async (req, reply) => {
    const id = String(req.params.id);
    if (!/^[A-Za-z0-9_-]{6,16}$/.test(id)) return reply.code(404).send({ error: 'Not found' });
    const q = getQuizFull(id);
    if (!q) return reply.code(404).send({ error: 'Not found' });
    return q;
  });

  fastify.post('/api/quizzes', async (req, reply) => {
    if (!createAllowed(req.ip)) return reply.code(429).send({ error: 'Slow down, try again later' });
    const v = validatePayload(req.body);
    if (v.error) return reply.code(400).send({ error: v.error });
    let id = genId();
    while (db.prepare('SELECT 1 FROM quizzes WHERE id=?').get(id)) id = genId();
    const token = genToken();
    createQuizTx(id, hashToken(token), v);
    return { id, editToken: token, url: `/q/${id}` };
  });

  fastify.put('/api/quizzes/:id', async (req, reply) => {
    const id = String(req.params.id);
    const row = db.prepare('SELECT edit_token_hash FROM quizzes WHERE id=?').get(id);
    if (!row) return reply.code(404).send({ error: 'Not found' });
    const given = String(req.body?.editToken || '');
    if (given.length < 16) return reply.code(403).send({ error: 'Bad edit token' });
    const a = Buffer.from(hashToken(given));
    const b = Buffer.from(row.edit_token_hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return reply.code(403).send({ error: 'Bad edit token' });
    const v = validatePayload(req.body);
    if (v.error) return reply.code(400).send({ error: v.error });
    db.prepare('UPDATE quizzes SET title=?,description=? WHERE id=?').run(v.title, v.description, id);
    replaceQuizTx(id, v);
    return { ok: true };
  });

  fastify.post('/api/quizzes/:id/take', async (req, reply) => {
    const id = String(req.params.id);
    const resultId = Number(req.body?.resultId);
    if (!Number.isInteger(resultId)) return reply.code(400).send({ error: 'resultId required' });
    const ok = db.prepare('SELECT 1 FROM results WHERE id=? AND quiz_id=?').get(resultId, id);
    if (!ok) return reply.code(400).send({ error: 'Bad result' });
    db.prepare('UPDATE quizzes SET takes=takes+1 WHERE id=?').run(id);
    return { ok: true };
  });

  fastify.get('/q/:id', (req, reply) => {
    const id = String(req.params.id);
    if (!/^[A-Za-z0-9_-]{6,16}$/.test(id)) return reply.code(404).sendFile('404.html');
    reply.sendFile('quiz.html');
  });

  fastify.setNotFoundHandler((req, reply) => {
    if (req.raw.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
    return reply.code(404).sendFile('404.html');
  });

  return fastify;
}

if (require.main === module) {
  build().then((app) => app.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' }));
}
module.exports = { build, db };
