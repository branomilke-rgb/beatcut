import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANALYSIS_RATE, detectBeats } from '../src/beats.ts';

function clickTrack(bpm: number, seconds: number, offsetMs = 0): Float32Array {
  const out = new Float32Array(Math.round(seconds * ANALYSIS_RATE));
  const beat = 60 / bpm;
  for (let t = offsetMs / 1000; t < seconds; t += beat) {
    const start = Math.round(t * ANALYSIS_RATE);
    for (let i = 0; i < 600 && start + i < out.length; i++) out[start + i] = 0.8 * Math.sin((2 * Math.PI * 1000 * i) / ANALYSIS_RATE);
  }
  return out;
}

for (const bpm of [90, 120, 150]) {
  test(`finds ${bpm} BPM and lands on the clicks`, () => {
    const grid = detectBeats(clickTrack(bpm, 30, 250));
    assert.ok(Math.abs(grid.bpm - bpm) < 1, `bpm ${grid.bpm}`);
    const period = 60000 / bpm;
    for (const b of grid.beatsMs) {
      const off = (((b - 250) % period) + period) % period;
      assert.ok(Math.min(off, period - off) <= 15, `beat ${b} is ${off.toFixed(1)} ms off`);
    }
  });
}

test('rejects silence', () => {
  assert.throws(() => detectBeats(new Float32Array(ANALYSIS_RATE * 10)), /NO_BEATS/);
});
