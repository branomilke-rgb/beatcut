/**
 * Planner: puts every moment (a kill, a goal, anything the user marked) exactly on
 * a beat. Shots are whole beats long and follow each other with hard cuts.
 * Same input -> byte-identical plan.
 */
import type { BeatGrid } from './beats.ts';

export const PLAN_VERSION = 'beatcut-plan-v1';

export interface ClipInput {
  id: string;
  durationMs: number;
  /** Moments inside the clip, in milliseconds from the clip start, best first. */
  momentsMs: number[];
}

export interface PlanOptions {
  targetMs: number;
  /** How much of the build-up before a moment to show. */
  leadMs?: number;
  /** How much after the moment to show. */
  tailMs?: number;
  /** Where the edit starts in the song; defaults to the first beat. */
  musicStartMs?: number;
}

export interface Shot {
  clipId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  durationMs: number;
  /** Timeline time of the moment — always a beat. */
  hitMs: number;
}

export interface EditPlan {
  version: typeof PLAN_VERSION;
  durationMs: number;
  musicStartMs: number;
  bpm: number;
  shots: Shot[];
  /** Moments that did not fit (clip too short around them, or overlapping a used shot). */
  skipped: { clipId: string; momentMs: number; reason: 'OUT_OF_CLIP' | 'OVERLAP' }[];
}

export class PlanError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

export function planEdit(clips: ClipInput[], beats: BeatGrid, options: PlanOptions): EditPlan {
  const leadMs = options.leadMs ?? 1200;
  const tailMs = options.tailMs ?? 800;
  const musicStartMs = options.musicStartMs ?? beats.beatsMs[0] ?? 0;
  const timeline = beats.beatsMs.filter(b => b >= musicStartMs).map(b => b - musicStartMs);
  const beatMs = 60000 / beats.bpm;
  const leadBeats = Math.max(1, Math.ceil(leadMs / beatMs));
  const shotBeats = leadBeats + Math.max(1, Math.ceil(tailMs / beatMs));

  const shots: Shot[] = [];
  const skipped: EditPlan['skipped'] = [];
  const used = new Map<string, [number, number][]>();
  let cursor = 0;

  // Round robin: every clip's best moment first, then every clip's second best, ...
  const queue: { clip: ClipInput; momentMs: number }[] = [];
  const rounds = Math.max(0, ...clips.map(c => c.momentsMs.length));
  for (let r = 0; r < rounds; r++) {
    for (const clip of clips) {
      const momentMs = clip.momentsMs[r];
      if (momentMs !== undefined) queue.push({ clip, momentMs });
    }
  }

  for (const { clip, momentMs } of queue) {
    const start = timeline[cursor];
    const hit = timeline[cursor + leadBeats];
    const end = timeline[cursor + shotBeats];
    if (start === undefined || hit === undefined || end === undefined || end > options.targetMs) break;

    const sourceStartMs = momentMs - (hit - start);
    const sourceEndMs = sourceStartMs + (end - start);
    if (sourceStartMs < 0 || sourceEndMs > clip.durationMs) {
      skipped.push({ clipId: clip.id, momentMs, reason: 'OUT_OF_CLIP' });
      continue;
    }
    const ranges = used.get(clip.id) ?? [];
    if (ranges.some(([s, e]) => sourceStartMs < e && sourceEndMs > s)) {
      skipped.push({ clipId: clip.id, momentMs, reason: 'OVERLAP' });
      continue;
    }
    ranges.push([sourceStartMs, sourceEndMs]);
    used.set(clip.id, ranges);
    shots.push({ clipId: clip.id, sourceStartMs, sourceEndMs, timelineStartMs: start, durationMs: end - start, hitMs: hit });
    cursor += shotBeats;
  }

  if (shots.length === 0) throw new PlanError('NOT_ENOUGH_MOMENTS', 'no moment fits into its clip and the song');
  const last = shots[shots.length - 1]!;
  return {
    version: PLAN_VERSION,
    durationMs: last.timelineStartMs + last.durationMs,
    musicStartMs,
    bpm: beats.bpm,
    shots,
    skipped,
  };
}
