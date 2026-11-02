/**
 * Local app: a tiny HTTP server on 127.0.0.1 that serves the page in public/ and
 * runs edits. Files go to out/jobs/<id>/ on this machine and nowhere else.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { makeEdit, type Stage } from './pipeline.ts';
import { FORMATS, type Format } from './render.ts';

const ROOT = join(import.meta.dirname, '..');
const JOBS_DIR = join(ROOT, 'out', 'jobs');
const PORT = Number(process.env.PORT ?? 3200);
const MAX_CLIPS = 6;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const LENGTHS_SEC = new Set([15, 30, 60]);

interface Job {
  id: string;
  dir: string;
  clips: string[];
  song?: string;
  state: 'collecting' | 'working' | 'done' | 'failed';
  stage?: Stage;
  error?: string;
  result?: { shots: number; durationMs: number; bpm: number; clipsUsed: number };
}

const jobs = new Map<string, Job>();

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function view(job: Job) {
  return { id: job.id, state: job.state, stage: job.stage, error: job.error, result: job.result, clips: job.clips.length, song: Boolean(job.song) };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 10_000) throw new Error('BODY_TOO_LARGE');
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function upload(req: IncomingMessage, res: ServerResponse, job: Job, kind: 'clip' | 'song', name: string): Promise<void> {
  if (job.state !== 'collecting') return send(res, 409, { error: 'JOB_STARTED' });
  const ext = extname(name).toLowerCase();
  if (!(kind === 'clip' ? VIDEO_EXT : AUDIO_EXT).has(ext)) return send(res, 415, { error: 'UNSUPPORTED_FILE', ext });
  if (kind === 'clip' && job.clips.length >= MAX_CLIPS) return send(res, 409, { error: 'TOO_MANY_CLIPS', max: MAX_CLIPS });
  // Our own file names: what the browser sent is only used for the extension.
  const path = join(job.dir, kind === 'clip' ? `clip-${job.clips.length + 1}${ext}` : `song${ext}`);
  if (kind === 'clip') job.clips.push(path);
  else job.song = path;
  await pipeline(req, createWriteStream(path));
  send(res, 200, view(job));
}

async function start(req: IncomingMessage, res: ServerResponse, job: Job): Promise<void> {
  if (job.state !== 'collecting') return send(res, 409, { error: 'JOB_STARTED' });
  if (!job.song || job.clips.length === 0) return send(res, 422, { error: 'NEED_SONG_AND_CLIPS' });
  const body = await readJson(req);
  const format = (body.format ?? '9:16') as Format;
  const lengthSec = Number(body.lengthSec ?? 30);
  const gameVolume = Number(body.gameVolume ?? 50);
  const musicVolume = Number(body.musicVolume ?? 100);
  const volumeOk = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100;
  if (!(format in FORMATS) || !LENGTHS_SEC.has(lengthSec) || !volumeOk(gameVolume) || !volumeOk(musicVolume)) {
    return send(res, 422, { error: 'BAD_SETTINGS' });
  }

  job.state = 'working';
  send(res, 202, view(job));
  const song = job.song;
  makeEdit(
    { song, clips: job.clips.map((path, i) => ({ id: `c${i + 1}`, path })), format, lengthMs: lengthSec * 1000, gameVolume, musicVolume },
    join(job.dir, 'edit.mp4'),
    stage => { job.stage = stage; },
  ).then(
    plan => {
      job.result = { shots: plan.shots.length, durationMs: plan.durationMs, bpm: plan.bpm, clipsUsed: new Set(plan.shots.map(s => s.clipId)).size };
      job.state = 'done';
    },
    (error: unknown) => {
      job.error = error instanceof Error ? error.message : String(error);
      job.state = 'failed';
      console.error(`job ${job.id} failed: ${job.error}`);
    },
  );
}

/** Streams the finished video with Range support so the player can seek. */
async function video(req: IncomingMessage, res: ServerResponse, job: Job): Promise<void> {
  if (job.state !== 'done') return send(res, 404, { error: 'NOT_READY' });
  const path = join(job.dir, 'edit.mp4');
  const { size } = await stat(path);
  const download = new URL(req.url!, 'http://x').searchParams.has('download');
  const headers: Record<string, string | number> = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' };
  if (download) headers['content-disposition'] = 'attachment; filename="beatcut-edit.mp4"';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const startByte = range[1] ? Number(range[1]) : size - Number(range[2]);
    const endByte = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (startByte > endByte || startByte >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return void res.end();
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${startByte}-${endByte}/${size}`, 'content-length': endByte - startByte + 1 });
    return pipeline(createReadStream(path, { start: startByte, end: endByte }), res);
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  return pipeline(createReadStream(path), res);
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x');
  const method = req.method ?? 'GET';

  if (method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return void res.end(await readFile(join(ROOT, 'public', 'index.html')));
  }
  if (method === 'POST' && url.pathname === '/api/jobs') {
    const id = randomUUID();
    const job: Job = { id, dir: join(JOBS_DIR, id), clips: [], state: 'collecting' };
    await mkdir(job.dir, { recursive: true });
    jobs.set(id, job);
    return send(res, 201, view(job));
  }

  const match = /^\/api\/jobs\/([0-9a-f-]{36})(?:\/(clip|song|start|video))?$/.exec(url.pathname);
  const job = match ? jobs.get(match[1]!) : undefined;
  if (!match || !job) return send(res, 404, { error: 'NOT_FOUND' });
  const action = match[2];

  if (method === 'GET' && !action) return send(res, 200, view(job));
  if (method === 'GET' && action === 'video') return video(req, res, job);
  if (method === 'POST' && (action === 'clip' || action === 'song')) return upload(req, res, job, action, url.searchParams.get('name') ?? '');
  if (method === 'POST' && action === 'start') return start(req, res, job);
  send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
}

createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: 'INTERNAL' });
    else res.destroy();
  });
}).listen(PORT, '127.0.0.1', () => {
  console.error(`beatcut app: http://localhost:${PORT}`);
});
