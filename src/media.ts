/** The only place that talks to ffmpeg / ffprobe. Everything stays on this machine. */
import { spawn } from 'node:child_process';
import { ANALYSIS_RATE } from './beats.ts';

function run(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => err.push(b));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${command} exited with ${code}: ${Buffer.concat(err).toString().trim().split('\n').slice(-5).join('\n')}`));
    });
  });
}

export interface Probe {
  durationMs: number;
  hasAudio: boolean;
}

export async function probe(path: string): Promise<Probe> {
  const json = JSON.parse(
    (await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path])).toString(),
  ) as { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  const duration = Number(json.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`BAD_MEDIA: cannot read the duration of ${path}`);
  return {
    durationMs: Math.round(duration * 1000),
    hasAudio: (json.streams ?? []).some(s => s.codec_type === 'audio'),
  };
}

/** Decodes any audio file to mono float samples at ANALYSIS_RATE. */
export async function decodeMono(path: string): Promise<Float32Array> {
  const raw = await run('ffmpeg', ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(ANALYSIS_RATE), '-f', 'f32le', 'pipe:1']);
  // Copy into a fresh, 4-byte aligned buffer; the pooled Buffer may start at any offset.
  const bytes = new Uint8Array(raw.length - (raw.length % 4));
  bytes.set(raw.subarray(0, bytes.length));
  return new Float32Array(bytes.buffer);
}

export async function ffmpeg(args: string[]): Promise<void> {
  await run('ffmpeg', args);
}
