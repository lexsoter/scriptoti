<?php
// ScripToti bug reports and suggestions. Anyone using the app may submit; only
// the holder of the private reading key (kept on the author's Mac) can read.
// Reports are stored outside the web root. Compatible with PHP 8.1.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

const READ_KEY_SHA256 = '0a20720af31ca741e4dcc0c09e4311b0264f4df5a5e858c4171ea75c323b8343';
const MAX_MESSAGE = 5000;
const MAX_PER_ADDRESS_PER_DAY = 10;
const MAX_TOTAL_PER_DAY = 300;

function out(array $data, int $status = 200): void { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function fail(string $code, int $status): void { out(['ok' => false, 'error' => $code], $status); }
function base_dir(): string {
  $dir = getenv('SCRIPTOTI_FEEDBACK_DIR') ?: dirname(__DIR__, 3) . '/scriptoti-feedback';
  if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) fail('storage', 500);
  return $dir;
}
function clean(string $text, int $max): string {
  $text = str_replace(["\r\n", "\r"], "\n", $text);
  $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
  return function_exists('mb_substr') ? mb_substr(trim($text), 0, $max) : substr(trim($text), 0, $max);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if (in_array($origin, ['http://127.0.0.1:43871', 'http://localhost:43871'], true)) {
  header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin');
  header('Access-Control-Allow-Methods: POST'); header('Access-Control-Allow-Headers: X-Scriptoti, Content-Type'); header('Access-Control-Max-Age: 600');
}
if ($method === 'OPTIONS') { http_response_code(204); exit; }
$action = (string)($_GET['action'] ?? $_POST['action'] ?? '');

if ($action === 'submit' && $method === 'POST') {
  if (($_SERVER['HTTP_X_SCRIPTOTI'] ?? '') !== '1') fail('origin', 403);
  if ((string)($_POST['website'] ?? '') !== '') out(['ok' => true]); // honeypot: pretend success
  $type = (string)($_POST['type'] ?? '');
  if (!in_array($type, ['bug', 'suggestion', 'question'], true)) fail('type', 400);
  $message = clean((string)($_POST['message'] ?? ''), MAX_MESSAGE);
  if ((function_exists('mb_strlen') ? mb_strlen($message) : strlen($message)) < 10) fail('message', 400);
  $email = trim((string)($_POST['email'] ?? ''));
  if ($email !== '' && (strlen($email) > 200 || !filter_var($email, FILTER_VALIDATE_EMAIL))) fail('email', 400);
  $meta = json_decode((string)($_POST['meta'] ?? '{}'), true);
  $meta = is_array($meta) ? array_map(fn($v) => is_scalar($v) ? clean((string)$v, 200) : '', array_slice($meta, 0, 20, true)) : [];

  $dir = base_dir();
  $lock = fopen($dir . '/lock', 'c'); if (!$lock || !flock($lock, LOCK_EX)) fail('busy', 503);
  $day = gmdate('Y-m-d'); $who = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . $day);
  $quota = json_decode((string)@file_get_contents($dir . '/quota.json'), true);
  if (!is_array($quota) || ($quota['day'] ?? '') !== $day) $quota = ['day' => $day];
  if (($quota[$who] ?? 0) >= MAX_PER_ADDRESS_PER_DAY || ($quota['_total'] ?? 0) >= MAX_TOTAL_PER_DAY) { flock($lock, LOCK_UN); fail('quota', 429); }
  $quota[$who] = ($quota[$who] ?? 0) + 1; $quota['_total'] = ($quota['_total'] ?? 0) + 1;
  file_put_contents($dir . '/quota.json', json_encode($quota));
  $state = json_decode((string)@file_get_contents($dir . '/state.json'), true);
  $id = (int)($state['last'] ?? 0) + 1;
  $entry = ['id' => $id, 'time' => gmdate('c'), 'type' => $type, 'message' => $message, 'email' => $email, 'meta' => $meta, 'from' => substr($who, 0, 12)];
  $ok = file_put_contents($dir . '/reports.jsonl', json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND) !== false
    && file_put_contents($dir . '/state.json', json_encode(['last' => $id])) !== false;
  flock($lock, LOCK_UN); fclose($lock);
  if (!$ok) fail('storage', 500);
  @chmod($dir . '/reports.jsonl', 0600);
  out(['ok' => true, 'id' => $id]);
}

if ($action === 'list' && $method === 'GET') {
  $key = (string)($_SERVER['HTTP_X_SCRIPTOTI_KEY'] ?? '');
  if ($key === '' || !hash_equals(READ_KEY_SHA256, hash('sha256', $key))) { usleep(300000); fail('forbidden', 403); }
  $after = max(0, (int)($_GET['after'] ?? 0));
  $file = base_dir() . '/reports.jsonl'; $list = [];
  if (is_file($file)) foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
    $entry = json_decode($line, true);
    if (is_array($entry) && ($entry['id'] ?? 0) > $after) $list[] = $entry;
  }
  out(['ok' => true, 'reports' => $list]);
}

fail('action', 400);
