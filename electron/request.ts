/** Checks what the window asks for before anything touches ffmpeg. Pure, so it is tested without Electron. */
import { extname } from 'node:path';
import type { EditRequest } from '../src/pipeline.ts';
import { FORMATS, type Format } from '../src/render.ts';

export const MAX_CLIPS = 6;
export const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
export const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];
const LENGTHS_SEC = [15, 30, 60];

const hasExt = (path: unknown, exts: string[]): path is string =>
  typeof path === 'string' && exts.includes(extname(path).slice(1).toLowerCase());

const volumeOk = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

export function parseEditRequest(input: unknown): EditRequest {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const { clips, song, format, lengthSec, gameVolume, musicVolume } = raw;
  if (!Array.isArray(clips) || clips.length === 0 || clips.length > MAX_CLIPS) throw new Error(`BAD_REQUEST: 1–${MAX_CLIPS} clips`);
  if (!clips.every(c => hasExt(c, VIDEO_EXT))) throw new Error('BAD_REQUEST: every clip must be a video file');
  if (!hasExt(song, AUDIO_EXT)) throw new Error('BAD_REQUEST: the song must be an audio file');
  if (typeof format !== 'string' || !(format in FORMATS)) throw new Error('BAD_REQUEST: format');
  if (typeof lengthSec !== 'number' || !LENGTHS_SEC.includes(lengthSec)) throw new Error('BAD_REQUEST: length');
  if (!volumeOk(gameVolume) || !volumeOk(musicVolume)) throw new Error('BAD_REQUEST: volume');
  return {
    song,
    clips: (clips as string[]).map((path, i) => ({ id: `c${i + 1}`, path })),
    format: format as Format,
    lengthMs: lengthSec * 1000,
    gameVolume,
    musicVolume,
  };
}
