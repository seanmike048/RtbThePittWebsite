import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney, isTerminal, launchBlockers, parseNetworkIds, track, trackedRuns } from './runs.ts';
import type { Dsp } from './types.ts';

const amazon: Dsp = { key: 'amazon_dsp', name: 'Amazon DSP', status: 'supported', note: '', seats: [{ id: 437, name: 'Amazon DSP AMER Display B', format: 'display', region: 'AMER' }] };
const ttd: Dsp = { key: 'ttd', name: 'The Trade Desk', status: 'not_integrated', note: '', seats: [{ id: 75, name: 'The Trade Desk (Non-CTV)', format: null, region: null }] };
const ok = { configured: true, canLaunch: true, busy: false };

test('Launch is blocked with a reason for a DSP that is not integrated; no Amazon fallback', () => {
  assert.deepEqual(launchBlockers(amazon, [437], [5412], ok), []);
  const b = launchBlockers(ttd, [75], [5412], ok);
  assert.equal(b.length, 1);
  assert.match(b[0], /not integrated.*Nothing will run on Amazon/);
  assert.ok(launchBlockers(amazon, [437], [5412], { ...ok, busy: true }).some((x) => /being accepted/.test(x)));
  assert.ok(launchBlockers(amazon, [437], [5412], { ...ok, canLaunch: false }).some((x) => /permission/.test(x)));
  assert.ok(launchBlockers(amazon, [437], [5412], { ...ok, configured: false }).some((x) => /not configured/.test(x)));
});

test('Network IDs: integers only, the rest is reported, never guessed', () => {
  assert.deepEqual(parseNetworkIds('5412, 5449 5412; abc 0'), { ids: [5412, 5449], invalid: ['abc', '0'] });
});

test('Tracked runs survive a reload and ignore tampered values', () => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  track(s, 'run_' + 'a'.repeat(20), true);
  track(s, 'run_' + 'b'.repeat(20), true);
  assert.deepEqual(trackedRuns(s), ['run_' + 'b'.repeat(20), 'run_' + 'a'.repeat(20)]);
  m.set('pitt-tracked-runs', JSON.stringify(['<script>', 'run_' + 'c'.repeat(20)]));
  assert.deepEqual(trackedRuns(s), ['run_' + 'c'.repeat(20)]);
  assert.deepEqual(trackedRuns(null), []);
  assert.equal(isTerminal('running'), false);
  assert.equal(isTerminal('timed_out'), true);
});

test('Money keeps an unknown currency visible', () => {
  assert.equal(fmtMoney(3100, 'EUR'), '€3,100');
  assert.equal(fmtMoney(3100, null), '3,100 (currency unknown)');
  assert.equal(fmtMoney(null, 'EUR'), 'n/a');
});
