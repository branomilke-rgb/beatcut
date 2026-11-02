/**
 * Beat detection: energy-flux onset envelope -> tempo by autocorrelation ->
 * fine period + phase by comb scoring. No models, no network, deterministic.
 */

export interface BeatGrid {
  bpm: number;
  /** Beat times in milliseconds from the start of the song. */
  beatsMs: number[];
  durationMs: number;
}

export const ANALYSIS_RATE = 22050;
const HOP = 256;
const MIN_BPM = 70;
const MAX_BPM = 180;

/** Half-wave rectified rise of log energy per hop. */
export function onsetEnvelope(samples: Float32Array): Float32Array {
  const frames = Math.floor(samples.length / HOP);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let energy = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i++) energy += samples[i]! * samples[i]!;
    const level = Math.log1p((1000 * energy) / HOP);
    env[f] = Math.max(0, level - prev);
    prev = level;
  }
  return env;
}

function at(env: Float32Array, pos: number): number {
  const i = Math.floor(pos);
  if (i < 0 || i + 1 >= env.length) return 0;
  const t = pos - i;
  return env[i]! * (1 - t) + env[i + 1]! * t;
}

/** Mean envelope value on a comb with the given period and phase (in frames). */
function combScore(env: Float32Array, period: number, phase: number): number {
  let sum = 0;
  let n = 0;
  for (let pos = phase; pos < env.length - 1; pos += period) {
    sum += at(env, pos);
    n++;
  }
  return n ? sum / n : 0;
}

/** Triangle blur so a fractional beat period still correlates at the nearest whole lag. */
function smooth(env: Float32Array): Float32Array {
  const kernel = [1, 2, 3, 2, 1];
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) {
    for (let k = 0; k < kernel.length; k++) out[i]! += (env[i + k - 2] ?? 0) * kernel[k]!;
  }
  return out;
}

function coarsePeriod(raw: Float32Array, fps: number): number {
  const env = smooth(raw);
  const minLag = Math.floor((60 * fps) / MAX_BPM);
  const maxLag = Math.ceil((60 * fps) / MIN_BPM);
  const scores = new Map<number, number>();
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i]! * env[i - lag]!;
    scores.set(lag, s / (env.length - lag));
    if (scores.get(lag)! > scores.get(best)!) best = lag;
  }
  // A pulse at P also correlates at 2P; take the faster tempo when it is nearly as strong.
  const half = Math.round(best / 2);
  const halfScore = Math.max(scores.get(half - 1) ?? 0, scores.get(half) ?? 0, scores.get(half + 1) ?? 0);
  if (half >= minLag && halfScore >= 0.8 * scores.get(best)!) {
    return [half - 1, half, half + 1].reduce((a, b) => ((scores.get(b) ?? 0) > (scores.get(a) ?? 0) ? b : a), half);
  }
  return best;
}

export function detectBeats(samples: Float32Array, sampleRate = ANALYSIS_RATE): BeatGrid {
  const durationMs = Math.round((samples.length / sampleRate) * 1000);
  const env = onsetEnvelope(samples);
  const fps = sampleRate / HOP;
  const peak = env.reduce((m, v) => Math.max(m, v), 0);
  if (env.length < 4 * fps || peak <= 1e-6) throw new Error('NO_BEATS: the song is too short or silent');

  const coarse = coarsePeriod(env, fps);
  let period = coarse;
  let phase = 0;
  let bestScore = -Infinity;
  for (let p = coarse - 1; p <= coarse + 1; p += 0.01) {
    for (let ph = 0; ph < p; ph += 0.25) {
      const s = combScore(env, p, ph);
      if (s > bestScore) {
        bestScore = s;
        period = p;
        phase = ph;
      }
    }
  }

  const beatsMs: number[] = [];
  for (let pos = phase; pos < env.length; pos += period) beatsMs.push(Math.round((pos / fps) * 1000));
  return { bpm: Math.round(((60 * fps) / period) * 100) / 100, beatsMs, durationMs };
}
