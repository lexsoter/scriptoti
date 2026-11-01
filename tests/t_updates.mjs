// A waiting publication must not change the active offline document, even
// when both publications have the same visible version number.
import { open, ROOT } from './lib.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptoti-update-'));
const repo = path.dirname(ROOT);
function build(name) {
  const dir = path.join(temp, name);
  fs.mkdirSync(dir); fs.cpSync(ROOT, path.join(dir, 'public'), { recursive: true });
  fs.cpSync(path.join(repo, 'i18n'), path.join(dir, 'i18n'), { recursive: true });
  const html = path.join(dir, 'public', 'index.html');
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('<head>', '<head>\n<meta name="update-test" content="' + name + '">'));
  execFileSync(process.execPath, [path.join(dir, 'i18n', 'build.mjs')]);
  return path.join(dir, 'public');
}
const a = build('A'), b = build('B'), bad = build('incomplete');
// Simulate an incomplete upload: the new worker arrives before its HTML.
fs.copyFileSync(path.join(a, 'index.html'), path.join(bad, 'index.html'));
let t;
try {
  t = await open({ root: a });
  t.page.setDefaultTimeout(10000);
  await t.page.waitForFunction(() => navigator.serviceWorker.controller);
  const snapshot = () => t.page.evaluate(async () => {
    const keys = (await caches.keys()).filter(k => k.startsWith('scriptoti-'));
    const shells = {};
    for (const key of keys) { const shell = await (await caches.open(key)).match('./index.html'); if (shell) shells[key] = await shell.text(); }
    return { keys, shells, version: document.querySelector('meta[name="scriptoti-version"]').content };
  });
  const first = await snapshot(), active = first.keys[0];
  t.check('initial release has its own complete offline cache', first.keys.length === 1 && first.shells[active]?.includes('name="update-test" content="A"'));
  const held = await t.context.newPage(); await held.goto(t.url);
  await t.page.evaluate(() => caches.open('scriptoti-obsolete'));
  t.state.root = b;
  await t.page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await t.page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration()).waiting);
  await t.page.waitForFunction(async () => {
    for (const key of await caches.keys()) {
      const shell = await (await caches.open(key)).match('./index.html');
      if (shell && (await shell.text()).includes('name="update-test" content="B"')) return true;
    }
    return false;
  });
  const waiting = await snapshot();
  t.check('same-version publication prepares a different cache', waiting.version === first.version && waiting.keys.length === 3 && Object.values(waiting.shells).some(s => s.includes('name="update-test" content="B"')), JSON.stringify({ keys: waiting.keys, markers: Object.values(waiting.shells).map(s => s.match(/name="update-test" content="[^"]*/)?.[0]) }));
  t.check('waiting update leaves the active cache byte-for-byte unchanged', waiting.shells[active] === first.shells[active]);
  await t.page.waitForFunction(() => !document.querySelector('#updateBanner').hidden);
  t.check('existing update banner and command remain available', await t.page.locator('#updateBannerBtn').isVisible());
  // The active worker must also refuse newer same-version HTML on navigation.
  await t.page.reload(); await t.page.waitForTimeout(700);
  t.check('online reload before Update still uses the active release', (await t.page.content()).includes('name="update-test" content="A"') && (await snapshot()).shells[active] === first.shells[active]);
  await t.context.setOffline(true); await t.page.reload(); await t.page.waitForTimeout(700);
  t.check('offline before Update still opens release A', (await t.page.content()).includes('name="update-test" content="A"'));
  await t.context.setOffline(false);
  await t.page.evaluate(() => document.querySelector('#appUpdateBtn').click());
  await t.page.waitForFunction(() => document.querySelector('meta[name="update-test"]')?.content === 'B');
  await t.page.waitForTimeout(700);
  const updated = await snapshot();
  t.check('Update activates B and cleans the old caches', updated.keys.length === 1 && !updated.keys.includes(active) && Object.values(updated.shells)[0].includes('name="update-test" content="B"'), JSON.stringify(updated.keys));
  await t.context.setOffline(true); await t.page.reload(); await t.page.waitForTimeout(700);
  t.check('offline after Update opens release B', (await t.page.content()).includes('name="update-test" content="B"'));
  await t.context.setOffline(false); t.state.root = bad;
  await t.page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    window.__incompleteDone = false;
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker.addEventListener('statechange', () => { if (worker.state === 'redundant') window.__incompleteDone = true; });
    });
    await registration.update();
  });
  await t.page.waitForFunction(() => window.__incompleteDone);
  t.check('incomplete publication cannot change B or become a waiting update', (await snapshot()).shells[updated.keys[0]] === updated.shells[updated.keys[0]] && await t.page.evaluate(async () => !(await navigator.serviceWorker.getRegistration()).waiting));
  await t.context.setOffline(true); await t.page.reload(); await t.page.waitForTimeout(700);
  t.check('B still works offline after an incomplete upload', (await t.page.content()).includes('name="update-test" content="B"'));
  t.report();
} catch (error) {
  if (t) { t.report(); console.error(await t.page.evaluate(async () => ({ toast: document.querySelector('#toast')?.textContent, status: document.querySelector('#saveStatus')?.textContent, button: document.querySelector('#appUpdateBtn')?.outerHTML, controller: navigator.serviceWorker.controller?.state, waiting: (await navigator.serviceWorker.getRegistration())?.waiting?.state, safe: Boolean(window.DraftSafe) }))); }
  throw error;
} finally { if (t) await t.close(); fs.rmSync(temp, { recursive: true, force: true }); }
