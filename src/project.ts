/** Project file: what the user wants edited. Paths are relative to the project file. */
import { dirname, resolve } from 'node:path';
import { FORMATS, type Format } from './render.ts';

export interface Project {
  song: string;
  format: Format;
  lengthMs: number;
  gameVolume: number;
  musicVolume: number;
  clips: { id: string; path: string; momentsMs: number[] }[];
}

function fail(message: string): never {
  throw new Error(`BAD_PROJECT: ${message}`);
}

function volume(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || value < 0 || value > 100) fail(`${name} must be a number 0–100`);
  return value;
}

export function parseProject(input: unknown, projectPath: string): Project {
  if (typeof input !== 'object' || input === null) fail('expected a JSON object');
  const raw = input as Record<string, unknown>;
  const base = dirname(resolve(projectPath));

  if (typeof raw.song !== 'string' || !raw.song) fail('"song" must be a path');
  const format = (raw.format ?? '9:16') as Format;
  if (!(format in FORMATS)) fail(`"format" must be one of ${Object.keys(FORMATS).join(', ')}`);
  const lengthSec = raw.lengthSec ?? 30;
  if (typeof lengthSec !== 'number' || lengthSec <= 0 || lengthSec > 180) fail('"lengthSec" must be 1–180');
  if (!Array.isArray(raw.clips) || raw.clips.length === 0) fail('"clips" must be a non-empty list');

  const clips = raw.clips.map((c: unknown, i: number) => {
    const clip = c as { path?: unknown; moments?: unknown };
    if (typeof clip?.path !== 'string' || !clip.path) fail(`clips[${i}].path must be a path`);
    if (!Array.isArray(clip.moments) || clip.moments.some(m => typeof m !== 'number' || m < 0)) {
      fail(`clips[${i}].moments must be a list of seconds`);
    }
    return { id: `c${i + 1}`, path: resolve(base, clip.path), momentsMs: (clip.moments as number[]).map(m => Math.round(m * 1000)) };
  });

  return {
    song: resolve(base, raw.song),
    format,
    lengthMs: Math.round(lengthSec * 1000),
    gameVolume: volume(raw.gameVolume, 50, 'gameVolume'),
    musicVolume: volume(raw.musicVolume, 100, 'musicVolume'),
    clips,
  };
}
