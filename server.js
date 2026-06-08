const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PATH = path.join(DATA_DIR, 'admin.txt');
const RANKING_PATH = path.join(DATA_DIR, 'ranking.txt');
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = 'sha256';

let adminData;
let rankingData;

function logProcesso(etapa, detalhes = {}) {
  const info = Object.entries(detalhes)
    .filter(([, valor]) => valor !== undefined && valor !== null)
    .map(([chave, valor]) => `${chave}=${String(valor).replace(/\s+/g, ' ')}`)
    .join(' ');

  console.log(`[${new Date().toISOString()}] ${etapa}${info ? ` | ${info}` : ''}`);
}

function readJsonFile(filePath, fallback) {
  logProcesso('arquivo:verificando', { arquivo: filePath });

  if (!fs.existsSync(filePath)) {
    logProcesso('arquivo:nao_encontrado_usando_padrao', { arquivo: filePath });
    return fallback;
  }

  try {
    logProcesso('arquivo:lendo', { arquivo: filePath });
    const content = fs.readFileSync(filePath, 'utf8').trim();
    logProcesso('arquivo:lido', { arquivo: filePath, bytes: content.length });
    return content ? JSON.parse(content) : fallback;
  } catch (error) {
    logProcesso('arquivo:erro_leitura', {
      arquivo: filePath,
      codigo: error.code,
      mensagem: error.message
    });
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2);
    logProcesso('arquivo:gravando', { arquivo: filePath, bytes: content.length });
    fs.writeFileSync(filePath, content);
    logProcesso('arquivo:gravado', { arquivo: filePath });
  } catch (error) {
    logProcesso('arquivo:erro_gravacao', {
      arquivo: filePath,
      pasta: DATA_DIR,
      codigo: error.code,
      mensagem: error.message
    });

    if (error.code === 'EROFS') {
      throw new Error(
        `A pasta de dados esta somente leitura: ${DATA_DIR}. ` +
        'Configure DATA_DIR para uma pasta gravavel ou use uma hospedagem com disco persistente.'
      );
    }
    throw error;
  }
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

function getDefaultRankingData() {
  return {
    nextId: 5,
    grupos: [
      { id: 1, nome: '2201', turma: '22', pontuacao: 0, ordem_ranking: 1 },
      { id: 2, nome: '2301', turma: '23', pontuacao: 0, ordem_ranking: 2 },
      { id: 3, nome: '2401', turma: '24', pontuacao: 0, ordem_ranking: 3 },
      { id: 4, nome: '2501', turma: '25', pontuacao: 0, ordem_ranking: 4 }
    ]
  };
}

function initDataFiles() {
  logProcesso('dados:iniciando', {
    raiz: __dirname,
    public: PUBLIC_DIR,
    data: DATA_DIR,
    data_env: process.env.DATA_DIR ? 'sim' : 'nao',
    admin: ADMIN_PATH,
    ranking: RANKING_PATH
  });

  logProcesso('dados:criando_pasta', { pasta: DATA_DIR });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  logProcesso('dados:pasta_pronta', { pasta: DATA_DIR, existe: fs.existsSync(DATA_DIR) });

  adminData = readJsonFile(ADMIN_PATH, {
    senha: hashPassword(process.env.ADMIN_INITIAL_PASSWORD || 'admin123')
  });

  if (!isHashedPassword(adminData.senha)) {
    logProcesso('admin:senha_sem_hash_convertendo', { arquivo: ADMIN_PATH });
    adminData.senha = hashPassword(adminData.senha);
  }

  rankingData = readJsonFile(RANKING_PATH, getDefaultRankingData());
  rankingData.grupos = Array.isArray(rankingData.grupos) ? rankingData.grupos : [];
  rankingData.nextId = Math.max(Number(rankingData.nextId) || 1, getNextId());

  normalizeRankingOrder(getCurrentRankingPositions());
  saveAdmin();
  saveRanking();

  logProcesso('dados:prontos', {
    grupos: rankingData.grupos.length,
    proximo_id: rankingData.nextId
  });
}

function saveAdmin() {
  logProcesso('admin:salvando', { arquivo: ADMIN_PATH });
  writeJsonFile(ADMIN_PATH, adminData);
}

function saveRanking() {
  logProcesso('ranking:salvando', {
    arquivo: RANKING_PATH,
    grupos: rankingData && Array.isArray(rankingData.grupos) ? rankingData.grupos.length : 0
  });
  writeJsonFile(RANKING_PATH, rankingData);
}

function getNextId() {
  const maxId = rankingData && rankingData.grupos.length
    ? Math.max(...rankingData.grupos.map(grupo => Number(grupo.id) || 0))
    : 0;
  return maxId + 1;
}

function getCurrentRankingPositions() {
  return new Map(getSortedGroups().map((grupo, index) => [grupo.id, index]));
}

function normalizeRankingOrder(previousPositions = new Map()) {
  rankingData.grupos.sort((a, b) => {
    const scoreDiff = Number(b.pontuacao) - Number(a.pontuacao);
    if (scoreDiff) return scoreDiff;

    const previousA = previousPositions.has(a.id) ? previousPositions.get(a.id) : Number.MAX_SAFE_INTEGER;
    const previousB = previousPositions.has(b.id) ? previousPositions.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (previousA !== previousB) return previousA - previousB;

    return Number(a.id) - Number(b.id);
  });

  rankingData.grupos.forEach((grupo, index) => {
    grupo.ordem_ranking = index + 1;
  });
}

function getSortedGroups() {
  return [...rankingData.grupos].sort((a, b) => {
    const scoreDiff = Number(b.pontuacao) - Number(a.pontuacao);
    if (scoreDiff) return scoreDiff;

    const orderDiff = Number(a.ordem_ranking) - Number(b.ordem_ranking);
    if (orderDiff) return orderDiff;

    return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });
}

function findGroup(id) {
  return rankingData.grupos.find(grupo => Number(grupo.id) === Number(id));
}

function getNetworkUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(info => info && info.family === 'IPv4' && !info.internal)
    .map(info => `http://${info.address}:${PORT}`);
}

app.use(express.json());
app.use((req, res, next) => {
  const inicio = Date.now();

  res.on('finish', () => {
    logProcesso('http:request', {
      metodo: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - inicio
    });
  });

  next();
});
app.use(['/admin.txt', '/ranking.txt', '/data', '/data/*'], (req, res) => {
  logProcesso('seguranca:bloqueio_arquivo_dados', {
    metodo: req.method,
    url: req.originalUrl
  });
  res.status(404).send('Not found');
});
app.use(express.static(PUBLIC_DIR));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ranking-local-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000, sameSite: 'lax' }
}));

app.get('/api/turmas', (req, res) => {
  const turmas = [...new Set(rankingData.grupos.map(grupo => grupo.turma))].sort();
  logProcesso('api:turmas', { total: turmas.length });
  res.json(turmas);
});

app.get('/api/ranking', (req, res) => {
  const { turma } = req.query;
  const grupos = getSortedGroups().filter(grupo => !turma || grupo.turma === turma);
  logProcesso('api:ranking', { turma: turma || 'todas', total: grupos.length });
  res.json(grupos);
});

app.post('/api/admin/login', (req, res) => {
  const senha = req.body && typeof req.body.senha === 'string' ? req.body.senha : '';

  if (verifyPassword(senha, adminData.senha)) {
    req.session.admin = true;
    logProcesso('admin:login_sucesso');
    res.json({ ok: true });
  } else {
    logProcesso('admin:login_falha');
    res.status(401).json({ erro: 'Senha incorreta' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  logProcesso('admin:logout');
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/admin/status', (req, res) => {
  logProcesso('admin:status', { logado: !!req.session.admin });
  res.json({ logado: !!req.session.admin });
});

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    logProcesso('admin:acesso_negado', { metodo: req.method, url: req.originalUrl });
    return res.status(403).json({ erro: 'Nao autorizado' });
  }

  next();
}

app.post('/api/admin/pontuacao', requireAdmin, (req, res) => {
  const { grupo_id, alteracao } = req.body;
  if (![100, 50, 10, -10, -50, -100].includes(alteracao)) {
    logProcesso('pontuacao:alteracao_invalida', { grupo_id, alteracao });
    return res.status(400).json({ erro: 'Alteracao invalida' });
  }

  const grupo = findGroup(grupo_id);
  if (!grupo) {
    logProcesso('pontuacao:grupo_nao_encontrado', { grupo_id, alteracao });
    return res.status(404).json({ erro: 'Grupo nao encontrado' });
  }

  const previousPositions = getCurrentRankingPositions();
  const pontuacaoAnterior = Number(grupo.pontuacao);
  grupo.pontuacao = Math.max(Number(grupo.pontuacao) + Number(alteracao), 0);
  normalizeRankingOrder(previousPositions);
  saveRanking();
  logProcesso('pontuacao:alterada', {
    grupo_id: grupo.id,
    grupo: grupo.nome,
    alteracao,
    antes: pontuacaoAnterior,
    depois: grupo.pontuacao
  });

  res.json(grupo);
});

app.post('/api/admin/senha', requireAdmin, (req, res) => {
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 4) {
    logProcesso('admin:senha_rejeitada', { motivo: 'muito_curta' });
    return res.status(400).json({ erro: 'Senha muito curta' });
  }

  adminData.senha = hashPassword(nova_senha);
  saveAdmin();
  logProcesso('admin:senha_alterada');
  res.json({ ok: true });
});

app.post('/api/admin/grupos', requireAdmin, (req, res) => {
  const { nome, turma } = req.body;
  if (!nome || !turma) {
    logProcesso('grupo:criacao_rejeitada', { motivo: 'nome_ou_turma_vazio' });
    return res.status(400).json({ erro: 'Nome e turma sao obrigatorios' });
  }

  const nomeNormalizado = nome.trim();
  const turmaNormalizada = turma.trim();

  if (!nomeNormalizado.startsWith(turmaNormalizada)) {
    logProcesso('grupo:criacao_rejeitada', {
      motivo: 'turma_incompativel',
      nome: nomeNormalizado,
      turma: turmaNormalizada
    });
    return res.status(400).json({ erro: `O grupo precisa comecar com ${turmaNormalizada}` });
  }

  const duplicado = rankingData.grupos.some(grupo => (
    grupo.nome === nomeNormalizado && grupo.turma === turmaNormalizada
  ));
  if (duplicado) {
    logProcesso('grupo:criacao_rejeitada', {
      motivo: 'duplicado',
      nome: nomeNormalizado,
      turma: turmaNormalizada
    });
    return res.status(409).json({ erro: 'Este grupo ja existe nessa turma' });
  }

  const grupo = {
    id: rankingData.nextId || getNextId(),
    nome: nomeNormalizado,
    turma: turmaNormalizada,
    pontuacao: 0,
    ordem_ranking: rankingData.grupos.length + 1
  };

  rankingData.nextId = grupo.id + 1;
  rankingData.grupos.push(grupo);
  saveRanking();
  logProcesso('grupo:criado', {
    id: grupo.id,
    nome: grupo.nome,
    turma: grupo.turma
  });
  res.json(grupo);
});

app.delete('/api/admin/grupos/:id', requireAdmin, (req, res) => {
  const beforeLength = rankingData.grupos.length;
  const grupoRemovido = findGroup(req.params.id);
  rankingData.grupos = rankingData.grupos.filter(grupo => Number(grupo.id) !== Number(req.params.id));

  if (rankingData.grupos.length === beforeLength) {
    logProcesso('grupo:exclusao_rejeitada', { id: req.params.id, motivo: 'nao_encontrado' });
    return res.status(404).json({ erro: 'Grupo nao encontrado' });
  }

  normalizeRankingOrder(getCurrentRankingPositions());
  saveRanking();
  logProcesso('grupo:excluido', {
    id: req.params.id,
    nome: grupoRemovido ? grupoRemovido.nome : undefined
  });
  res.json({ ok: true });
});

app.use((error, req, res, next) => {
  logProcesso('http:erro_interno', {
    metodo: req.method,
    url: req.originalUrl,
    mensagem: error.message
  });
  res.status(500).json({ erro: 'Erro interno no servidor' });
});

try {
  logProcesso('servidor:iniciando', { porta: PORT, host: HOST });
  initDataFiles();
  const server = app.listen(PORT, HOST, () => {
    logProcesso('servidor:rodando', { url: `http://localhost:${PORT}` });
    getNetworkUrls().forEach(url => logProcesso('servidor:url_celular', { url }));
  });

  server.on('error', error => {
    logProcesso('servidor:erro_listen', {
      porta: PORT,
      host: HOST,
      codigo: error.code,
      mensagem: error.message
    });
  });
} catch (error) {
  logProcesso('servidor:falha_inicio', {
    mensagem: error.message,
    codigo: error.code,
    stack: error.stack
  });
  throw error;
}
