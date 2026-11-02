/** Song + clips -> plan -> video. Shared by the CLI and the app server. */
import { detectBeats } from './beats.ts';
import { decodeMono, ffmpeg, probe } from './media.ts';
import { autoMoments } from './moments.ts';
import { planEdit, type ClipInput, type EditPlan } from './plan.ts';
import { buildRenderArgs, type Format, type SourceInfo } from './render.ts';

export interface EditRequest {
  song: string;
  /** Without `momentsMs` the clip's loudest spots are used. */
  clips: { id: string; path: string; momentsMs?: number[] }[];
  format: Format;
  lengthMs: number;
  gameVolume: number;
  musicVolume: number;
}

export type Stage = 'song' | 'clips' | 'render';

export async function prepareEdit(
  req: EditRequest,
  onStage: (stage: Stage) => void = () => {},
): Promise<{ plan: EditPlan; sources: Map<string, SourceInfo> }> {
  onStage('song');
  const beats = detectBeats(await decodeMono(req.song));

  onStage('clips');
  const sources = new Map<string, SourceInfo>();
  const clips: ClipInput[] = [];
  for (const clip of req.clips) {
    const info = await probe(clip.path);
    sources.set(clip.id, { path: clip.path, hasAudio: info.hasAudio });
    const momentsMs = clip.momentsMs
      ?? (info.hasAudio ? autoMoments(await decodeMono(clip.path), info.durationMs) : [Math.round(info.durationMs / 2)]);
    clips.push({ id: clip.id, durationMs: info.durationMs, momentsMs });
  }
  return { plan: planEdit(clips, beats, { targetMs: req.lengthMs }), sources };
}

export async function makeEdit(req: EditRequest, outPath: string, onStage: (stage: Stage) => void = () => {}): Promise<EditPlan> {
  const { plan, sources } = await prepareEdit(req, onStage);
  onStage('render');
  await ffmpeg(buildRenderArgs(plan, sources, req.song, outPath, req));
  return plan;
}
