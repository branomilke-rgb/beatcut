import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANALYSIS_RATE } from '../src/beats.ts';
import { autoMoments } from '../src/moments.ts';

function withBursts(seconds: number, bursts: [atSec: number, amp: number][]): Float32Array {
  const out = new Float32Array(seconds * ANALYSIS_RATE);
  for (let i = 0; i < out.length; i++) out[i] = 0.01 * Math.sin(i / 7);
  for (const [at, amp] of bursts) {
    const start = Math.round(at * ANALYSIS_RATE);
    for (let i = 0; i < 4000; i++) out[start + i] = amp * Math.sin(i / 3);
  }
  return out;
}

test('finds the loudest spots, strongest first', () => {
  const m = autoMoments(withBursts(20, [[4, 0.5], [9, 0.9], [15, 0.7]]), 20000);
  assert.deepEqual(m.map(ms => Math.round(ms / 1000)), [9, 15, 4]);
});

test('keeps moments apart and away from the edges', () => {
  const m = autoMoments(withBursts(20, [[0.5, 1], [6, 0.8], [6.8, 0.9], [19.5, 1]]), 20000);
  assert.equal(m.length, 1);
  assert.ok(Math.abs(m[0]! - 6800) < 200);
});

test('silent clip falls back to its middle', () => {
  assert.deepEqual(autoMoments(new Float32Array(10 * ANALYSIS_RATE), 10000), [5000]);
});
