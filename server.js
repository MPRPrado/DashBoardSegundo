const express = require('express');
const session = require('express-session');
const initSqlJs = require('sql.js');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const DB_PATH = path.join(__dirname, 'ranking.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = 'sha256';
const RANKING_ORDER = 'pontuacao DESC, ordem_ranking ASC, nome ASC, id ASC';

let db;

async function initDB() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      turma TEXT NOT NULL,
      pontuacao INTEGER DEFAULT 0,
      ordem_ranking INTEGER
    );
    CREATE TABLE IF NOT EXISTS integrantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grupo_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      senha TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grupo_id INTEGER,
      alteracao INTEGER,
      criado_em TEXT DEFAULT (datetime('now'))
    );
  `);

  ensureRankingOrderColumn();
  normalizeRankingOrder(getCurrentRankingPositions());
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_grupos_nome_turma ON grupos(nome, turma)');

  const admin = queryOne('SELECT senha FROM admin WHERE id = 1');
  if (!admin) {
    db.run('INSERT INTO admin (id, senha) VALUES (1, ?)', [
      hashPassword(process.env.ADMIN_INITIAL_PASSWORD || 'admin123')
    ]);
  } else if (!isHashedPassword(admin.senha)) {
    db.run('UPDATE admin SET senha = ? WHERE id = 1', [hashPassword(admin.senha)]);
  }

  saveDB();
}

function saveDB() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(
    String(password),
    salt,
    HASH_ITERATIONS,
    HASH_KEYLEN,
    HASH_DIGEST
  ).toString('hex');

  return `pbkdf2$${HASH_ITERATIONS}$${salt}$${hash}`;
}

function isHashedPassword(value) {
  return typeof value === 'string' && value.startsWith('pbkdf2$');
}

function verifyPassword(password, storedPassword) {
  if (!isHashedPassword(storedPassword)) {
    return String(password) === String(storedPassword);
  }

  const [, iterations, salt, storedHash] = storedPassword.split('$');
  const hash = crypto.pbkdf2Sync(String(password), salt, Number(iterations), HASH_KEYLEN, HASH_DIGEST);
  const storedBuffer = Buffer.from(storedHash, 'hex');

  return storedBuffer.length === hash.length && crypto.timingSafeEqual(storedBuffer, hash);
}

function queryAll(sql, params = []) {
  const result = db.exec(sql, params);
  if (!result.length) return [];

  const { columns, values } = result[0];
  return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

function hasColumn(tableName, columnName) {
  return queryAll(`PRAGMA table_info(${tableName})`).some(column => column.name === columnName);
}

function ensureRankingOrderColumn() {
  if (!hasColumn('grupos', 'ordem_ranking')) {
    db.run('ALTER TABLE grupos ADD COLUMN ordem_ranking INTEGER');
  }
}

function getCurrentRankingPositions() {
  const grupos = queryAll(`SELECT id FROM grupos ORDER BY ${RANKING_ORDER}`);
  return new Map(grupos.map((grupo, index) => [grupo.id, index]));
}

function normalizeRankingOrder(previousPositions = new Map()) {
  const grupos = queryAll('SELECT id, pontuacao FROM grupos');
  grupos.sort((a, b) => {
    const scoreDiff = Number(b.pontuacao) - Number(a.pontuacao);
    if (scoreDiff) return scoreDiff;

    const previousA = previousPositions.has(a.id) ? previousPositions.get(a.id) : Number.MAX_SAFE_INTEGER;
    const previousB = previousPositions.has(b.id) ? previousPositions.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (previousA !== previousB) return previousA - previousB;

    return Number(a.id) - Number(b.id);
  });

  grupos.forEach((grupo, index) => {
    db.run('UPDATE grupos SET ordem_ranking = ? WHERE id = ?', [index + 1, grupo.id]);
  });
}

function getNetworkUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(info => info && info.family === 'IPv4' && !info.internal)
    .map(info => `http://${info.address}:${PORT}`);
}

app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ranking-local-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000, sameSite: 'lax' }
}));

app.get('/api/turmas', (req, res) => {
  res.json(queryAll('SELECT DISTINCT turma FROM grupos ORDER BY turma').map(t => t.turma));
});

app.get('/api/ranking', (req, res) => {
  const { turma } = req.query;
  const grupos = turma
    ? queryAll(`SELECT * FROM grupos WHERE turma = ? ORDER BY ${RANKING_ORDER}`, [turma])
    : queryAll(`SELECT * FROM grupos ORDER BY ${RANKING_ORDER}`);

  res.json(grupos);
});

app.get('/api/grupos/:id/integrantes', (req, res) => {
  res.json(queryAll('SELECT * FROM integrantes WHERE grupo_id = ? ORDER BY nome ASC', [req.params.id]));
});

app.post('/api/admin/login', (req, res) => {
  const admin = queryOne('SELECT senha FROM admin WHERE id = 1');
  const senha = req.body && typeof req.body.senha === 'string' ? req.body.senha : '';

  if (admin && verifyPassword(senha, admin.senha)) {
    if (!isHashedPassword(admin.senha)) {
      db.run('UPDATE admin SET senha = ? WHERE id = 1', [hashPassword(senha)]);
      saveDB();
    }

    req.session.admin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ erro: 'Senha incorreta' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ logado: !!req.session.admin });
});

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(403).json({ erro: 'Não autorizado' });
  next();
}

app.post('/api/admin/pontuacao', requireAdmin, (req, res) => {
  const { grupo_id, alteracao } = req.body;
  if (![100, 50, 10, -10, -50, -100].includes(alteracao)) {
    return res.status(400).json({ erro: 'Alteração inválida' });
  }

  if (!queryOne('SELECT id FROM grupos WHERE id = ?', [grupo_id])) {
    return res.status(404).json({ erro: 'Grupo não encontrado' });
  }

  const previousPositions = getCurrentRankingPositions();
  db.run('UPDATE grupos SET pontuacao = max(pontuacao + ?, 0) WHERE id = ?', [alteracao, grupo_id]);
  db.run('INSERT INTO historico (grupo_id, alteracao) VALUES (?, ?)', [grupo_id, alteracao]);
  normalizeRankingOrder(previousPositions);
  saveDB();

  res.json(queryOne('SELECT * FROM grupos WHERE id = ?', [grupo_id]));
});

app.post('/api/admin/senha', requireAdmin, (req, res) => {
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 4) {
    return res.status(400).json({ erro: 'Senha muito curta' });
  }

  db.run('UPDATE admin SET senha = ? WHERE id = 1', [hashPassword(nova_senha)]);
  saveDB();
  res.json({ ok: true });
});

app.post('/api/admin/grupos', requireAdmin, (req, res) => {
  const { nome, turma } = req.body;
  if (!nome || !turma) {
    return res.status(400).json({ erro: 'Nome e turma são obrigatórios' });
  }

  const nomeNormalizado = nome.trim();
  const turmaNormalizada = turma.trim();

  if (!nomeNormalizado.startsWith(turmaNormalizada)) {
    return res.status(400).json({ erro: `O grupo precisa começar com ${turmaNormalizada}` });
  }

  if (queryOne('SELECT id FROM grupos WHERE nome = ? AND turma = ?', [nomeNormalizado, turmaNormalizada])) {
    return res.status(409).json({ erro: 'Este grupo já existe nessa turma' });
  }

  const proximaOrdem = queryOne('SELECT COALESCE(MAX(ordem_ranking), 0) + 1 AS ordem FROM grupos').ordem;
  db.run(
    'INSERT INTO grupos (nome, turma, pontuacao, ordem_ranking) VALUES (?, ?, 0, ?)',
    [nomeNormalizado, turmaNormalizada, proximaOrdem]
  );
  saveDB();
  res.json(queryOne('SELECT * FROM grupos WHERE rowid = last_insert_rowid()'));
});

app.delete('/api/admin/grupos/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM integrantes WHERE grupo_id = ?', [req.params.id]);
  db.run('DELETE FROM grupos WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

app.post('/api/admin/integrantes', requireAdmin, (req, res) => {
  const { grupo_id, nome } = req.body;
  if (!grupo_id || !nome) {
    return res.status(400).json({ erro: 'grupo_id e nome são obrigatórios' });
  }

  if (!queryOne('SELECT id FROM grupos WHERE id = ?', [grupo_id])) {
    return res.status(404).json({ erro: 'Grupo não encontrado' });
  }

  db.run('INSERT INTO integrantes (grupo_id, nome) VALUES (?, ?)', [grupo_id, nome.trim()]);
  saveDB();
  res.json(queryOne('SELECT * FROM integrantes WHERE rowid = last_insert_rowid()'));
});

app.delete('/api/admin/integrantes/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM integrantes WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

initDB().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    getNetworkUrls().forEach(url => console.log(`Celular na mesma rede: ${url}`));
  });
});
