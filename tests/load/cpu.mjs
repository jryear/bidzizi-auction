import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function processes() {
  return execFileSync('ps', ['-axo', 'pid=,ppid=,time='], { encoding: 'utf8' }).trim().split('\n').map(line => {
    const [pid, ppid, time] = line.trim().split(/\s+/), parts = time.split(':').map(Number);
    return { pid: Number(pid), ppid: Number(ppid), seconds: parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1] };
  });
}

/** Monotonic observed CPU seconds. Exiting processes cannot subtract earlier work.
 * One-second samples omit the tail of a process that exits before the next sample.
 * New backends contribute all their CPU since spawn; existing processes start at a baseline.
 */
export function cpuTracker(roots, readProcesses = processes) {
  assert.ok(roots.every(p => Number.isInteger(p) && p > 1), 'Owned app/Postgres PIDs required for CPU sampling.');
  let previous = null;
  const totals = roots.map(() => 0);
  return () => {
    const rows = readProcesses();
    const current = roots.map(root => {
      const ids = new Set([root]);
      for (let size = -1; size !== ids.size;) { size = ids.size; for (const row of rows) if (ids.has(row.ppid)) ids.add(row.pid); }
      return new Map(rows.filter(row => ids.has(row.pid)).map(row => [row.pid, row.seconds]));
    });
    if (previous) current.forEach((tree, index) => {
      for (const [pid, seconds] of tree) totals[index] += Math.max(0, seconds - (previous[index].get(pid) ?? 0));
    });
    previous = current;
    return [...totals];
  };
}
