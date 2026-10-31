// Runs every test one after the other; fails if any of them fails.
import { spawnSync } from 'node:child_process';
const tests = ['t1_6', 't5', 't9_12', 't14_16', 't_round', 't_dual_margins', 't_stall', 't_reconnect', 't_rename', 't_029', 't_share', 't_share_refused'];
const failed = [];
for (const name of tests) {
  console.log(`\n== ${name}`);
  const run = spawnSync(process.execPath, [`${name}.mjs`], { cwd: import.meta.dirname, stdio: 'inherit', timeout: 600000 });
  if (run.status !== 0) failed.push(name);
}
console.log(failed.length ? `\nFalliti: ${failed.join(', ')}` : `\nTutti i ${tests.length} gruppi di prove sono passati.`);
process.exitCode = failed.length ? 1 : 0;
