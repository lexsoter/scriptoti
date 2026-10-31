<?php
// ScripToti sync relay. Stores and forwards encrypted Yjs updates for shared
// screenplays. The server never sees keys or text: every payload is AES-GCM
// ciphertext produced in the browser. Compatible with PHP 8.1.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

const MAX_PAYLOAD = 1572864;        // base64 characters per update or snapshot
const MAX_ROOM_BYTES = 25165824;    // log + snapshot per room
const MAX_ROOMS_PER_DAY = 40;       // per client address
const MAX_ROOMS_TOTAL_PER_DAY = 300; // for the whole server
const PRESENCE_TTL = 40;            // seconds
const MAX_PRESENCE = 30;

function out(array $data, int $status = 200): void { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_SLASHES); exit; }
function fail(string $code, int $status): void { out(['ok' => false, 'error' => $code], $status); }

function base_dir(): string {
  // Outside the web root: /home/<user>/scriptoti-sync-data (relay lives in public_html/scriptoti/sync).
  $dir = getenv('SCRIPTOTI_SYNC_DIR') ?: dirname(__DIR__, 3) . '/scriptoti-sync-data';
  if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) fail('storage', 500);
  return $dir;
}
function room_id(): string {
  $room = (string)($_GET['room'] ?? $_POST['room'] ?? '');
  if (!preg_match('/^[a-f0-9]{32}$/', $room)) fail('room', 400);
  return $room;
}
function room_dir(string $room): string {
  $dir = base_dir() . '/' . $room;
  if (!is_file($dir . '/meta.json')) fail('missing', 404);
  return $dir;
}
function read_json(string $file, $default) { if (!is_file($file)) return $default; $data = json_decode((string)file_get_contents($file), true); return is_array($data) ? $data : $default; }
function write_json(string $file, $data): void {
  $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
  if (file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_SLASHES)) === false || !rename($tmp, $file)) { @unlink($tmp); fail('storage', 500); }
}
function payload(): string {
  $data = (string)($_POST['data'] ?? '');
  if ($data === '' || strlen($data) > MAX_PAYLOAD || !preg_match('/^[A-Za-z0-9+\/]+={0,2}$/', $data)) fail('payload', 413);
  return $data;
}
function authorize(string $dir): void {
  $meta = read_json($dir . '/meta.json', []);
  $write = (string)($_POST['write'] ?? '');
  if ($write === '' || !isset($meta['write']) || !hash_equals((string)$meta['write'], hash('sha256', $write))) fail('forbidden', 403);
}
/** Runs $task holding the room lock. */
function locked(string $dir, callable $task) {
  $lock = fopen($dir . '/lock', 'c');
  if (!$lock || !flock($lock, LOCK_EX)) fail('busy', 503);
  try { return $task(); } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function state(string $dir): array { return read_json($dir . '/state.json', ['head' => 0, 'snapshot' => 0, 'bytes' => 0]); }
function log_entries(string $dir, int $after): array {
  $entries = [];
  $file = $dir . '/log.jsonl';
  if (!is_file($file)) return $entries;
  $handle = fopen($file, 'r');
  while ($handle && ($line = fgets($handle)) !== false) {
    $entry = json_decode($line, true);
    if (is_array($entry) && isset($entry['s'], $entry['d']) && $entry['s'] > $after) $entries[] = ['seq' => (int)$entry['s'], 'data' => (string)$entry['d']];
  }
  if ($handle) fclose($handle);
  return $entries;
}
function presence(string $dir, ?array $mine = null): array {
  $file = $dir . '/presence.json';
  $now = time();
  $all = array_filter(read_json($file, []), fn($p) => is_array($p) && ($p['t'] ?? 0) > $now - PRESENCE_TTL);
  if ($mine) { $all[$mine['id']] = ['d' => $mine['d'], 't' => $now]; if (count($all) > MAX_PRESENCE) { uasort($all, fn($a, $b) => $b['t'] <=> $a['t']); $all = array_slice($all, 0, MAX_PRESENCE, true); } write_json($file, $all); }
  $list = [];
  foreach ($all as $id => $p) $list[] = ['id' => (string)$id, 'data' => (string)$p['d']];
  return $list;
}

$action = (string)($_GET['action'] ?? $_POST['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
// The local edition (AI kit) runs on 127.0.0.1 and calls this relay cross-origin.
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if (in_array($origin, ['http://127.0.0.1:43871', 'http://localhost:43871'], true)) {
  header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin');
  header('Access-Control-Allow-Methods: GET, POST'); header('Access-Control-Allow-Headers: X-Scriptoti, Content-Type'); header('Access-Control-Max-Age: 600');
}
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method === 'POST' && ($_SERVER['HTTP_X_SCRIPTOTI'] ?? '') !== '1') fail('origin', 403);

if ($action === 'create' && $method === 'POST') {
  $write = (string)($_POST['writeHash'] ?? '');
  if (!preg_match('/^[a-f0-9]{64}$/', $write)) fail('write', 400);
  $base = base_dir();
  $quota = $base . '/quota.json';
  $day = gmdate('Y-m-d'); $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . $day);
  $lock = fopen($base . '/quota.lock', 'c'); flock($lock, LOCK_EX);
  $counts = read_json($quota, []);
  if (($counts['day'] ?? '') !== $day) $counts = ['day' => $day];
  if (($counts[$ip] ?? 0) >= MAX_ROOMS_PER_DAY || ($counts['_total'] ?? 0) >= MAX_ROOMS_TOTAL_PER_DAY) { flock($lock, LOCK_UN); fail('quota', 429); }
  $counts[$ip] = ($counts[$ip] ?? 0) + 1; $counts['_total'] = ($counts['_total'] ?? 0) + 1; write_json($quota, $counts);
  flock($lock, LOCK_UN); fclose($lock);
  $room = bin2hex(random_bytes(16));
  $dir = $base . '/' . $room;
  if (!mkdir($dir, 0700)) fail('storage', 500);
  write_json($dir . '/meta.json', ['write' => $write, 'created' => time()]);
  write_json($dir . '/state.json', ['head' => 0, 'snapshot' => 0, 'bytes' => 0]);
  out(['ok' => true, 'room' => $room]);
}

if ($action === 'pull' && $method === 'GET') {
  $dir = room_dir(room_id());
  $after = max(0, (int)($_GET['after'] ?? 0));
  $result = locked($dir, function () use ($dir, $after) {
    $state = state($dir);
    $data = ['ok' => true, 'head' => $state['head']];
    if ($after < $state['snapshot']) {
      $snap = read_json($dir . '/snapshot.json', null);
      if ($snap) $data['snapshot'] = ['seq' => (int)$snap['seq'], 'data' => (string)$snap['data']];
      $after = $state['snapshot'];
    }
    $data['updates'] = $after < $state['head'] ? log_entries($dir, $after) : [];
    $data['presence'] = presence($dir);
    return $data;
  });
  out($result);
}

if ($action === 'push' && $method === 'POST') {
  $dir = room_dir(room_id()); authorize($dir); $data = payload();
  $seq = locked($dir, function () use ($dir, $data) {
    $state = state($dir);
    if ($state['bytes'] + strlen($data) > MAX_ROOM_BYTES) fail('full', 507);
    $seq = $state['head'] + 1;
    if (file_put_contents($dir . '/log.jsonl', json_encode(['s' => $seq, 'd' => $data]) . "\n", FILE_APPEND) === false) fail('storage', 500);
    $state['head'] = $seq; $state['bytes'] += strlen($data);
    write_json($dir . '/state.json', $state);
    return $seq;
  });
  out(['ok' => true, 'seq' => $seq]);
}

if ($action === 'snapshot' && $method === 'POST') {
  // A client that has applied everything up to `upto` replaces the log with its state.
  $dir = room_dir(room_id()); authorize($dir); $data = payload();
  $upto = (int)($_POST['upto'] ?? 0);
  $done = locked($dir, function () use ($dir, $data, $upto) {
    $state = state($dir);
    if ($upto <= $state['snapshot'] || $upto > $state['head']) return false;
    write_json($dir . '/snapshot.json', ['seq' => $upto, 'data' => $data]);
    $rest = log_entries($dir, $upto);
    $lines = ''; $bytes = strlen($data);
    foreach ($rest as $entry) { $lines .= json_encode(['s' => $entry['seq'], 'd' => $entry['data']]) . "\n"; $bytes += strlen($entry['data']); }
    $tmp = $dir . '/log.jsonl.tmp';
    if (file_put_contents($tmp, $lines) === false || !rename($tmp, $dir . '/log.jsonl')) fail('storage', 500);
    $state['snapshot'] = $upto; $state['bytes'] = $bytes;
    write_json($dir . '/state.json', $state);
    return true;
  });
  out(['ok' => true, 'compacted' => $done]);
}

if ($action === 'presence' && $method === 'POST') {
  $dir = room_dir(room_id()); authorize($dir);
  $id = (string)($_POST['client'] ?? '');
  if (!preg_match('/^[a-f0-9]{16,32}$/', $id)) fail('client', 400);
  $data = payload();
  if (strlen($data) > 4096) fail('payload', 413);
  $list = locked($dir, fn() => presence($dir, ['id' => $id, 'd' => $data]));
  out(['ok' => true, 'presence' => $list]);
}

fail('action', 400);
