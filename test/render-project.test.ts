import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { EditPlan } from '../src/plan.ts';
import { parseProject } from '../src/project.ts';
import { buildRenderArgs } from '../src/render.ts';

const plan: EditPlan = {
  version: 'beatcut-plan-v1', durationMs: 4000, musicStartMs: 500, bpm: 120, skipped: [],
  shots: [
    { clipId: 'c1', sourceStartMs: 1000, sourceEndMs: 3000, timelineStartMs: 0, durationMs: 2000, hitMs: 1000 },
    { clipId: 'c2', sourceStartMs: 0, sourceEndMs: 2000, timelineStartMs: 2000, durationMs: 2000, hitMs: 3000 },
  ],
};
const sources = new Map([['c1', { path: 'a.mp4', hasAudio: true }], ['c2', { path: 'b.mp4', hasAudio: false }]]);

test('one input per shot, then the song; concat and mix', () => {
  const args = buildRenderArgs(plan, sources, 'song.mp3', 'out.mp4', { format: '9:16', gameVolume: 50, musicVolume: 100 });
  assert.deepEqual(args.slice(2, 8), ['-ss', '1.000', '-t', '2.000', '-i', 'a.mp4']);
  assert.deepEqual(args.slice(14, 20), ['-ss', '0.500', '-t', '4.000', '-i', 'song.mp3']);
  const graph = args[args.indexOf('-filter_complex') + 1]!;
  assert.match(graph, /scale=1080:1920/);
  assert.match(graph, /\[0:a\].*volume=0\.50/);
  assert.match(graph, /anullsrc=r=48000:cl=stereo,atrim=duration=2\.000\[a1\]/);
  assert.match(graph, /concat=n=2:v=1:a=1/);
  assert.match(graph, /\[2:a\].*volume=1\.00\[song\]/);
  assert.equal(args.at(-1), 'out.mp4');
});

test('unknown clip in a plan is an error', () => {
  assert.throws(() => buildRenderArgs(plan, new Map(), 's.mp3', 'o.mp4', { format: '1:1', gameVolume: 0, musicVolume: 0 }), /UNKNOWN_CLIP/);
});

test('project defaults and relative paths', () => {
  const p = parseProject({ song: 'music/s.mp3', clips: [{ path: 'v.mp4', moments: [1.5] }] }, 'proj/edit.json');
  assert.equal(p.song, resolve('proj/music/s.mp3'));
  assert.deepEqual(p.clips, [{ id: 'c1', path: resolve('proj/v.mp4'), momentsMs: [1500] }]);
  assert.deepEqual([p.format, p.lengthMs, p.gameVolume, p.musicVolume], ['9:16', 30000, 50, 100]);
});

test('project validation names the field', () => {
  assert.throws(() => parseProject({ song: 's', clips: [] }, 'x.json'), /clips/);
  assert.throws(() => parseProject({ song: 's', format: '4:3', clips: [{ path: 'v', moments: [] }] }, 'x.json'), /format/);
  assert.throws(() => parseProject({ song: 's', gameVolume: 150, clips: [{ path: 'v', moments: [] }] }, 'x.json'), /gameVolume/);
});
