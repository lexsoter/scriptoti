import { open } from './lib.mjs';
const t = await open();
const base = 'Title\n\nINT. CASA - GIORNO\n\n';
// 5. Redo after a long series of Undo rebuilds exactly the last state (several random sessions)
const seed0 = Number(process.env.SEED || 1);
for (let seed = seed0; seed < seed0 + Number(process.env.N || 25); seed++) {
  let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  await t.load(base + 'Luca entra.\n\nFABIO\nCiao.\n\n(piano)\n\nFine.');
  await t.caret((await t.src()).indexOf('Fine.'));
  const keys = ['a', 'b', ' ', 'Enter', 'Tab', 'Backspace', 'Shift+Enter', '.', '(', ')', 'C', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  const states = [await t.src()];
  for (let i = 0; i < 90; i++) {
    const key = keys[Math.floor(rnd() * keys.length)];
    if (key.length === 1) await t.page.keyboard.type(key); else await t.page.keyboard.press(key);
    await t.page.waitForTimeout(25);
  }
  await t.page.waitForTimeout(200);
  const final = await t.src();
  for (let i = 0; i < 140; i++) { await t.page.keyboard.press('Meta+z'); await t.page.waitForTimeout(15); }
  await t.page.waitForTimeout(200);
  const undone = await t.src();
  for (let i = 0; i < 140; i++) { await t.page.keyboard.press('Meta+Shift+z'); await t.page.waitForTimeout(15); }
  await t.page.waitForTimeout(250);
  const redone = await t.src();
  t.check(`5 seed ${seed}: undo returns to start, redo rebuilds the final text`, undone === states[0] && redone === final, `undone==start ${undone === states[0]} redo==final ${redone === final}\nfinal ${JSON.stringify(final)}\nredo  ${JSON.stringify(redone)}`);
}

t.report();
await t.close();
