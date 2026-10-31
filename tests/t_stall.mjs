// The share connection gives up after 15 s also when the server sends the
// headers and then never finishes the answer, and the next call works.
import { open } from './lib.mjs';
import http from 'node:http';
let calls = 0;
const server = http.createServer((q, r) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
  if (q.method === 'OPTIONS') { r.writeHead(204, cors); r.end(); return; }
  r.writeHead(200, { 'content-type': 'application/json', ...cors });
  if (++calls === 1) r.write('{"ok":true,'); else r.end('{"ok":true,"head":0,"updates":[],"presence":[]}');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const t = await open();
const result = await t.page.evaluate(async relay => {
  const S = window.DraftShare, client = new S.Client({ descriptor: { relay, room: 'a'.repeat(32), key: 'x' }, doc: new S.Y.Doc() });
  const start = Date.now();
  const first = await Promise.race([client.call('GET', { action: 'pull' }).then(() => 'answered', e => e.code), new Promise(ok => setTimeout(() => ok('still waiting'), 25000))]);
  const second = await client.call('GET', { action: 'pull' }).then(() => 'answered', e => e.code);
  return { first, seconds: Math.round((Date.now() - start) / 1000), second };
}, `http://127.0.0.1:${server.address().port}/relay.php`);
t.check('a stalled answer ends in a timeout at about 15 s', result.first === 'timeout' && result.seconds >= 14 && result.seconds <= 17, JSON.stringify(result));
t.check('the next call goes through', result.second === 'answered', JSON.stringify(result));
t.report();
await t.close(); server.close();
