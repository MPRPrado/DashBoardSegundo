<?php

declare(strict_types=1);

const APP_VERSION = '2.0.0';
const HASH_ITERATIONS = 120000;

$rootDir = __DIR__;
$dataDir = getenv('DATA_DIR') ?: $rootDir . DIRECTORY_SEPARATOR . 'data';
$adminPath = $dataDir . DIRECTORY_SEPARATOR . 'admin.txt';
$rankingPath = $dataDir . DIRECTORY_SEPARATOR . 'ranking.txt';
$logPath = getenv('LOG_FILE') ?: $rootDir . DIRECTORY_SEPARATOR . 'server.log';
$requestStartedAt = microtime(true);

header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('Content-Type: application/json; charset=utf-8');

session_name('ranking_admin');
session_set_cookie_params([
    'lifetime' => 3600,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
]);
session_start();

function logEvent(string $level, string $area, string $message, array $details = []): void
{
    global $logPath;

    $parts = [];
    foreach ($details as $key => $value) {
        if ($value === null) {
            continue;
        }
        $formatted = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
        $formatted = preg_replace('/\s+/', ' ', $formatted) ?? $formatted;
        $parts[] = $key . '="' . $formatted . '"';
    }

    $line = sprintf(
        '[%s] %s %s: %s%s%s',
        date('d/m/Y, H:i:s'),
        $level,
        $area,
        $message,
        $parts ? ' | ' : '',
        implode(' ', $parts)
    );

    error_log($line);
    @file_put_contents($logPath, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
}

function jsonResponse(mixed $data, int $status = 200): void
{
    global $requestStartedAt;

    http_response_code($status);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($status >= 400 || $method !== 'GET') {
        logEvent('HTTP', 'REQUEST', 'Requisicao finalizada', [
            'metodo' => $method,
            'rota' => requestRoute(),
            'status' => $status,
            'ms' => round((microtime(true) - $requestStartedAt) * 1000),
        ]);
    }

    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestBody(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $body = json_decode($raw, true);
    return is_array($body) ? $body : [];
}

function readJsonFile(string $path, array $fallback): array
{
    if (!is_file($path)) {
        logEvent('AVISO', 'ARQUIVO', 'Arquivo nao existe, usando dados padrao', ['arquivo' => $path]);
        return $fallback;
    }

    $content = @file_get_contents($path);
    if ($content === false) {
        logEvent('ERRO', 'ARQUIVO', 'Falha ao ler arquivo', ['arquivo' => $path]);
        return $fallback;
    }

    $data = json_decode(trim($content), true);
    if (!is_array($data)) {
        logEvent('ERRO', 'ARQUIVO', 'Arquivo possui JSON invalido', ['arquivo' => $path]);
        return $fallback;
    }

    return $data;
}

function writeJsonFile(string $path, array $data): void
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || @file_put_contents($path, $json . PHP_EOL, LOCK_EX) === false) {
        logEvent('ERRO', 'ARQUIVO', 'Falha ao gravar arquivo', [
            'arquivo' => $path,
            'pasta_gravavel' => is_writable(dirname($path)),
        ]);
        throw new RuntimeException('Nao foi possivel salvar os dados. Verifique a permissao da pasta data.');
    }
}

function defaultRanking(): array
{
    return [
        'nextId' => 5,
        'grupos' => [
            ['id' => 1, 'nome' => '2201', 'turma' => '22', 'pontuacao' => 0, 'ordem_ranking' => 1],
            ['id' => 2, 'nome' => '2301', 'turma' => '23', 'pontuacao' => 0, 'ordem_ranking' => 2],
            ['id' => 3, 'nome' => '2401', 'turma' => '24', 'pontuacao' => 0, 'ordem_ranking' => 3],
            ['id' => 4, 'nome' => '2501', 'turma' => '25', 'pontuacao' => 0, 'ordem_ranking' => 4],
        ],
    ];
}

function verifyStoredPassword(string $password, string $stored): bool
{
    if (str_starts_with($stored, 'pbkdf2$')) {
        $parts = explode('$', $stored);
        if (count($parts) !== 4) {
            return false;
        }
        [, $iterations, $salt, $storedHash] = $parts;
        $calculated = hash_pbkdf2('sha256', $password, $salt, (int) $iterations, 64);
        return hash_equals($storedHash, $calculated);
    }

    if (str_starts_with($stored, '$2') || str_starts_with($stored, '$argon')) {
        return password_verify($password, $stored);
    }

    return hash_equals($stored, $password);
}

function sortedGroups(array $ranking): array
{
    $groups = $ranking['grupos'] ?? [];
    usort($groups, static function (array $a, array $b): int {
        $scoreDiff = ((int) ($b['pontuacao'] ?? 0)) <=> ((int) ($a['pontuacao'] ?? 0));
        if ($scoreDiff !== 0) {
            return $scoreDiff;
        }

        $orderDiff = ((int) ($a['ordem_ranking'] ?? PHP_INT_MAX)) <=> ((int) ($b['ordem_ranking'] ?? PHP_INT_MAX));
        if ($orderDiff !== 0) {
            return $orderDiff;
        }

        return strnatcasecmp((string) ($a['nome'] ?? ''), (string) ($b['nome'] ?? ''));
    });
    return $groups;
}

function rankingPositions(array $ranking): array
{
    $positions = [];
    foreach (sortedGroups($ranking) as $index => $group) {
        $positions[(int) $group['id']] = $index;
    }
    return $positions;
}

function normalizeRanking(array &$ranking, array $previousPositions = []): void
{
    usort($ranking['grupos'], static function (array $a, array $b) use ($previousPositions): int {
        $scoreDiff = ((int) ($b['pontuacao'] ?? 0)) <=> ((int) ($a['pontuacao'] ?? 0));
        if ($scoreDiff !== 0) {
            return $scoreDiff;
        }

        $previousA = $previousPositions[(int) $a['id']] ?? PHP_INT_MAX;
        $previousB = $previousPositions[(int) $b['id']] ?? PHP_INT_MAX;
        if ($previousA !== $previousB) {
            return $previousA <=> $previousB;
        }

        return ((int) $a['id']) <=> ((int) $b['id']);
    });

    foreach ($ranking['grupos'] as $index => &$group) {
        $group['ordem_ranking'] = $index + 1;
    }
    unset($group);
}

function nextId(array $ranking): int
{
    $ids = array_map(static fn(array $group): int => (int) ($group['id'] ?? 0), $ranking['grupos'] ?? []);
    return ($ids ? max($ids) : 0) + 1;
}

function requireAdmin(): void
{
    if (empty($_SESSION['admin'])) {
        logEvent('AVISO', 'ADMIN', 'Acesso negado', ['rota' => requestRoute()]);
        jsonResponse(['erro' => 'Nao autorizado'], 403);
    }
}

function requestRoute(): string
{
    if (isset($_GET['route'])) {
        return trim((string) $_GET['route'], '/');
    }

    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
    return trim((string) preg_replace('#^/api/?#', '', $uri), '/');
}

function buildVersion(): string
{
    $files = [
        __FILE__,
        __DIR__ . '/public/index.html',
        __DIR__ . '/public/superadminana.html',
        __DIR__ . '/public/styles.css',
    ];
    $latest = max(array_map(static fn(string $file): int => is_file($file) ? filemtime($file) : 0, $files));
    return date('Ymd-Hi', $latest);
}

function findGroupIndex(array $ranking, int $id): ?int
{
    foreach ($ranking['grupos'] as $index => $group) {
        if ((int) ($group['id'] ?? 0) === $id) {
            return $index;
        }
    }
    return null;
}

try {
    if (!is_dir($dataDir) && !@mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
        throw new RuntimeException('Nao foi possivel criar a pasta data.');
    }

    if (!is_file($logPath)) {
        @file_put_contents($logPath, '');
    }

    $initialPassword = getenv('ADMIN_INITIAL_PASSWORD') ?: 'admin123';
    $admin = readJsonFile($adminPath, ['senha' => password_hash($initialPassword, PASSWORD_DEFAULT)]);
    $ranking = readJsonFile($rankingPath, defaultRanking());
    $ranking['grupos'] = isset($ranking['grupos']) && is_array($ranking['grupos']) ? $ranking['grupos'] : [];
    $ranking['nextId'] = max((int) ($ranking['nextId'] ?? 1), nextId($ranking));

    if (!is_file($adminPath)) {
        writeJsonFile($adminPath, $admin);
    }
    if (!is_file($rankingPath)) {
        normalizeRanking($ranking, rankingPositions($ranking));
        writeJsonFile($rankingPath, $ranking);
    }

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $route = requestRoute();
    $body = requestBody();

    if ($method === 'GET' && $route === 'version') {
        jsonResponse(['version' => APP_VERSION, 'build' => buildVersion()]);
    }

    if ($method === 'GET' && $route === 'turmas') {
        $turmas = array_values(array_unique(array_map(static fn(array $group): string => (string) $group['turma'], $ranking['grupos'])));
        sort($turmas, SORT_NATURAL);
        jsonResponse($turmas);
    }

    if ($method === 'GET' && $route === 'ranking') {
        $groups = sortedGroups($ranking);
        $turma = isset($_GET['turma']) ? trim((string) $_GET['turma']) : '';
        if ($turma !== '') {
            $groups = array_values(array_filter($groups, static fn(array $group): bool => (string) $group['turma'] === $turma));
        }
        jsonResponse($groups);
    }

    if ($method === 'POST' && $route === 'admin/login') {
        $password = isset($body['senha']) ? (string) $body['senha'] : '';
        if (verifyStoredPassword($password, (string) ($admin['senha'] ?? ''))) {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            logEvent('OK', 'ADMIN', 'Login realizado');
            jsonResponse(['ok' => true]);
        }
        logEvent('AVISO', 'ADMIN', 'Tentativa de login com senha incorreta');
        jsonResponse(['erro' => 'Senha incorreta'], 401);
    }

    if ($method === 'POST' && $route === 'admin/logout') {
        $_SESSION = [];
        session_destroy();
        logEvent('INFO', 'ADMIN', 'Logout realizado');
        jsonResponse(['ok' => true]);
    }

    if ($method === 'GET' && $route === 'admin/status') {
        jsonResponse(['logado' => !empty($_SESSION['admin'])]);
    }

    if ($method === 'POST' && $route === 'admin/pontuacao') {
        requireAdmin();
        $groupId = (int) ($body['grupo_id'] ?? 0);
        $change = (int) ($body['alteracao'] ?? 0);
        if (!in_array($change, [100, 50, 10, -10, -50, -100], true)) {
            jsonResponse(['erro' => 'Alteracao invalida'], 400);
        }

        $index = findGroupIndex($ranking, $groupId);
        if ($index === null) {
            jsonResponse(['erro' => 'Grupo nao encontrado'], 404);
        }

        $previousPositions = rankingPositions($ranking);
        $before = (int) $ranking['grupos'][$index]['pontuacao'];
        $ranking['grupos'][$index]['pontuacao'] = max($before + $change, 0);
        normalizeRanking($ranking, $previousPositions);
        writeJsonFile($rankingPath, $ranking);
        $updatedIndex = findGroupIndex($ranking, $groupId);
        $updated = $ranking['grupos'][$updatedIndex];
        logEvent('OK', 'PONTOS', 'Pontuacao alterada', [
            'grupo' => $updated['nome'],
            'antes' => $before,
            'depois' => $updated['pontuacao'],
        ]);
        jsonResponse($updated);
    }

    if ($method === 'POST' && $route === 'admin/senha') {
        requireAdmin();
        $newPassword = isset($body['nova_senha']) ? (string) $body['nova_senha'] : '';
        if (strlen($newPassword) < 4) {
            jsonResponse(['erro' => 'Senha muito curta'], 400);
        }
        $admin['senha'] = password_hash($newPassword, PASSWORD_DEFAULT);
        writeJsonFile($adminPath, $admin);
        logEvent('OK', 'ADMIN', 'Senha alterada');
        jsonResponse(['ok' => true]);
    }

    if ($method === 'POST' && $route === 'admin/grupos') {
        requireAdmin();
        $name = trim((string) ($body['nome'] ?? ''));
        $class = trim((string) ($body['turma'] ?? ''));
        if ($name === '' || $class === '') {
            jsonResponse(['erro' => 'Nome e turma sao obrigatorios'], 400);
        }
        if (!str_starts_with($name, $class)) {
            jsonResponse(['erro' => "O grupo precisa comecar com {$class}"], 400);
        }
        foreach ($ranking['grupos'] as $group) {
            if ((string) $group['nome'] === $name && (string) $group['turma'] === $class) {
                jsonResponse(['erro' => 'Este grupo ja existe nessa turma'], 409);
            }
        }

        $id = max((int) $ranking['nextId'], nextId($ranking));
        $group = [
            'id' => $id,
            'nome' => $name,
            'turma' => $class,
            'pontuacao' => 0,
            'ordem_ranking' => count($ranking['grupos']) + 1,
        ];
        $ranking['nextId'] = $id + 1;
        $ranking['grupos'][] = $group;
        writeJsonFile($rankingPath, $ranking);
        logEvent('OK', 'GRUPO', 'Grupo criado', ['id' => $id, 'nome' => $name, 'turma' => $class]);
        jsonResponse($group);
    }

    if ($method === 'DELETE' && preg_match('#^admin/grupos/(\d+)$#', $route, $matches)) {
        requireAdmin();
        $groupId = (int) $matches[1];
        $index = findGroupIndex($ranking, $groupId);
        if ($index === null) {
            jsonResponse(['erro' => 'Grupo nao encontrado'], 404);
        }
        $removed = $ranking['grupos'][$index];
        $previousPositions = rankingPositions($ranking);
        array_splice($ranking['grupos'], $index, 1);
        normalizeRanking($ranking, $previousPositions);
        writeJsonFile($rankingPath, $ranking);
        logEvent('OK', 'GRUPO', 'Grupo excluido', ['id' => $groupId, 'nome' => $removed['nome']]);
        jsonResponse(['ok' => true]);
    }

    jsonResponse(['erro' => 'Rota nao encontrada'], 404);
} catch (Throwable $error) {
    logEvent('ERRO', 'SERVIDOR', 'Erro interno', [
        'mensagem' => $error->getMessage(),
        'rota' => requestRoute(),
    ]);
    jsonResponse(['erro' => 'Erro interno no servidor. Consulte server.log.'], 500);
}
