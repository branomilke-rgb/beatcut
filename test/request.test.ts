import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEditRequest } from '../electron/request.ts';

const ok = { clips: ['C:/v/a.mp4', 'C:/v/b.MOV'], song: 'C:/m/s.mp3', format: '9:16', lengthSec: 30, gameVolume: 50, musicVolume: 100 };

test('turns a valid window request into an edit request', () => {
  const r = parseEditRequest(ok);
  assert.deepEqual(r.clips, [{ id: 'c1', path: 'C:/v/a.mp4' }, { id: 'c2', path: 'C:/v/b.MOV' }]);
  assert.equal(r.lengthMs, 30000);
});

test('rejects anything else with a named reason', () => {
  for (const [patch, reason] of [
    [{ clips: [] }, /clips/],
    [{ clips: Array(7).fill('a.mp4') }, /clips/],
    [{ clips: ['notes.txt'] }, /video/],
    [{ song: 'a.mp4' }, /song/],
    [{ format: '4:3' }, /format/],
    [{ lengthSec: 45 }, /length/],
    [{ gameVolume: -1 }, /volume/],
  ] as const) {
    assert.throws(() => parseEditRequest({ ...ok, ...patch }), reason);
  }
  assert.throws(() => parseEditRequest(null), /BAD_REQUEST/);
});
