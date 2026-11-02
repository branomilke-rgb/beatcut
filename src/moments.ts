/**
 * Picks moments in a clip without anyone marking them: the loudest spots of the
 * clip's own audio (shots, explosions, crowd), spread apart. Plain signal
 * processing, no models. Returned strongest first.
 */
import { ANALYSIS_RATE } from './beats.ts';

const HOP = 1024;
const MIN_GAP_MS = 2500;
const EDGE_START_MS = 1500;
const EDGE_END_MS = 1000;

export function autoMoments(samples: Float32Array, durationMs: number, max = 4, sampleRate = ANALYSIS_RATE): number[] {
  const frameMs = (HOP / sampleRate) * 1000;
  const frames = Math.floor(samples.length / HOP);
  const levels: { index: number; level: number }[] = [];
  for (let f = 0; f < frames; f++) {
    let energy = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i++) energy += samples[i]! * samples[i]!;
    levels.push({ index: f, level: energy / HOP });
  }
  levels.sort((a, b) => b.level - a.level || a.index - b.index);

  // Only spots that stand out from the clip: at least 15 % of its loudest energy.
  const floor = Math.max(1e-7, 0.15 * (levels[0]?.level ?? 0));
  const picked: number[] = [];
  for (const { index, level } of levels) {
    if (picked.length >= max || level < floor) break;
    const ms = Math.round(index * frameMs);
    if (ms < EDGE_START_MS || ms > durationMs - EDGE_END_MS) continue;
    if (picked.some(p => Math.abs(p - ms) < MIN_GAP_MS)) continue;
    picked.push(ms);
  }
  return picked.length ? picked : [Math.round(durationMs / 2)];
}
