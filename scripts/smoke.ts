/**
 * End-to-end smoke run on synthetic media only (test pattern video + click track),
 * so no copyrighted song or real footage is ever needed. Output goes to ./out.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'out', 'smoke');
mkdirSync(dir, { recursive: true });

function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
}

ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=12',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', join(dir, 'clip1.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast', join(dir, 'clip2.mp4')]);
ff(['-f', 'lavfi', '-i', 'aevalsrc=0.8*sin(2*PI*1000*t)*lt(mod(t+0.2\\,0.5)\\,0.03):s=44100:d=40', join(dir, 'song.wav')]);

writeFileSync(join(dir, 'project.json'), JSON.stringify({
  song: 'song.wav', format: '9:16', lengthSec: 15,
  clips: [{ path: 'clip1.mp4', moments: [2.5, 6, 9.5] }, { path: 'clip2.mp4', moments: [3, 7] }],
}, null, 2));

const r = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'src', 'cli.ts'), 'render', join(dir, 'project.json'), join(dir, 'edit.mp4')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
