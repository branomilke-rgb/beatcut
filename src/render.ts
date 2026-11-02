/**
 * Renderer: turns a plan into one ffmpeg command. Hard cuts, fill-the-frame
 * framing, game audio under the song. No effects, no transitions.
 */
import type { EditPlan } from './plan.ts';

export const FORMATS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
} as const;
export type Format = keyof typeof FORMATS;

export interface SourceInfo {
  path: string;
  hasAudio: boolean;
}

export interface RenderOptions {
  format: Format;
  /** 0–100. */
  gameVolume: number;
  /** 0–100. */
  musicVolume: number;
  fps?: number;
}

const sec = (ms: number) => (ms / 1000).toFixed(3);

export function buildRenderArgs(
  plan: EditPlan,
  sources: ReadonlyMap<string, SourceInfo>,
  songPath: string,
  outPath: string,
  options: RenderOptions,
): string[] {
  const { width, height } = FORMATS[options.format];
  const fps = options.fps ?? 30;
  const game = (options.gameVolume / 100).toFixed(2);
  const music = (options.musicVolume / 100).toFixed(2);

  const args = ['-hide_banner', '-y'];
  const filters: string[] = [];
  let concatInputs = '';

  plan.shots.forEach((shot, i) => {
    const source = sources.get(shot.clipId);
    if (!source) throw new Error(`UNKNOWN_CLIP: ${shot.clipId}`);
    const d = sec(shot.durationMs);
    args.push('-ss', sec(shot.sourceStartMs), '-t', d, '-i', source.path);
    filters.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},` +
        `setsar=1,fps=${fps},format=yuv420p,trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`,
    );
    filters.push(
      source.hasAudio
        ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${game},apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${d}[a${i}]`,
    );
    concatInputs += `[v${i}][a${i}]`;
  });

  const songIndex = plan.shots.length;
  args.push('-ss', sec(plan.musicStartMs), '-t', sec(plan.durationMs), '-i', songPath);
  filters.push(`${concatInputs}concat=n=${plan.shots.length}:v=1:a=1[vout][game]`);
  filters.push(`[${songIndex}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${music}[song]`);
  filters.push(`[game][song]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`);

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outPath,
  );
  return args;
}
