import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BeatGrid } from '../src/beats.ts';
import { planEdit, PlanError } from '../src/plan.ts';

const grid = (bpm: number, seconds: number, firstMs = 100): BeatGrid => {
  const beatsMs = [];
  for (let t = firstMs; t < seconds * 1000; t += 60000 / bpm) beatsMs.push(Math.round(t));
  return { bpm, beatsMs, durationMs: seconds * 1000 };
};

const clips = [
  { id: 'a', durationMs: 20000, momentsMs: [3000, 9000, 15000] },
  { id: 'b', durationMs: 12000, momentsMs: [6000, 2500] },
];

test('every moment lands on a beat and shots are back to back', () => {
  const beats = grid(120, 60);
  const plan = planEdit(clips, beats, { targetMs: 30000 });
  const onBeat = new Set(beats.beatsMs.map(b => b - plan.musicStartMs));
  let t = 0;
  for (const shot of plan.shots) {
    assert.equal(shot.timelineStartMs, t);
    assert.ok(onBeat.has(shot.hitMs), `hit ${shot.hitMs} is not a beat`);
    const moment = shot.sourceStartMs + (shot.hitMs - shot.timelineStartMs);
    assert.ok(clips.find(c => c.id === shot.clipId)!.momentsMs.includes(moment));
    t += shot.durationMs;
  }
  assert.equal(plan.durationMs, t);
  assert.equal(plan.shots.length, 5);
});

test('never exceeds the target length', () => {
  const plan = planEdit(clips, grid(120, 60), { targetMs: 5000 });
  assert.ok(plan.durationMs <= 5000);
  assert.equal(plan.shots.length, 2);
});

test('skips moments that do not fit their clip or overlap a used shot', () => {
  const plan = planEdit([{ id: 'a', durationMs: 10000, momentsMs: [200, 4000, 4300, 9900] }], grid(120, 60), { targetMs: 30000 });
  assert.deepEqual(plan.skipped.map(s => [s.momentMs, s.reason]), [[200, 'OUT_OF_CLIP'], [4300, 'OVERLAP'], [9900, 'OUT_OF_CLIP']]);
  assert.equal(plan.shots.length, 1);
});

test('is deterministic', () => {
  const beats = grid(97.3, 60, 437);
  assert.equal(JSON.stringify(planEdit(clips, beats, { targetMs: 30000 })), JSON.stringify(planEdit(clips, beats, { targetMs: 30000 })));
});

test('fails with a named reason when nothing fits', () => {
  assert.throws(() => planEdit([{ id: 'a', durationMs: 500, momentsMs: [250] }], grid(120, 60), { targetMs: 30000 }),
    (e: unknown) => e instanceof PlanError && e.code === 'NOT_ENOUGH_MOMENTS');
});
