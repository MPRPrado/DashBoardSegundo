<?php

declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rawurldecode($path);

if (str_starts_with($path, '/api')) {
    $_GET['route'] = trim(substr($path, 4), '/');
    require __DIR__ . '/api.php';
    return true;
}

if (str_starts_with($path, '/data') || $path === '/server.log') {
    http_response_code(404);
    echo 'Not found';
    return true;
}

$publicFiles = [
    '/' => 'index.html',
    '/index.html' => 'index.html',
    '/superadminana.html' => 'superadminana.html',
    '/styles.css' => 'styles.css',
];

if (isset($publicFiles[$path])) {
    $file = __DIR__ . '/public/' . $publicFiles[$path];
    $extension = pathinfo($file, PATHINFO_EXTENSION);
    header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('Content-Type: ' . ($extension === 'css' ? 'text/css' : 'text/html') . '; charset=utf-8');
    readfile($file);
    return true;
}

http_response_code(404);
echo 'Not found';
return true;
