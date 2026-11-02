# beatcut

A minimal beat-synced highlight editor. You give it a song and a few gameplay clips
with the moments you care about (in seconds). It finds the beat of the song, puts
every moment exactly on a beat, and renders one video with ffmpeg.

Deliberately small: hard cuts only, no effects, no slow motion, no transitions.

```
song ──► beats.ts (onset envelope → tempo → beat grid)
clips ─► plan.ts  (each moment on a beat, whole-beat shots, deterministic)
       ► render.ts (one ffmpeg command: crop to format, concat, game audio under the song)
```

## Requirements

- Node.js ≥ 22.18 (runs the TypeScript directly, no build step)
- `ffmpeg` and `ffprobe` on `PATH`

## Usage

```json
{
  "song": "song.mp3",
  "format": "9:16",
  "lengthSec": 30,
  "gameVolume": 50,
  "musicVolume": 100,
  "clips": [
    { "path": "clip1.mp4", "moments": [4.2, 11.8] },
    { "path": "clip2.mp4", "moments": [7.5] }
  ]
}
```

```bash
node src/cli.ts analyze song.mp3              # beat grid as JSON
node src/cli.ts plan project.json             # edit plan as JSON
node src/cli.ts render project.json edit.mp4  # video + edit.mp4.plan.json
```

Formats: `9:16`, `16:9`, `1:1`. Volumes are 0–100. Paths are relative to the project file.
A moment that does not fit inside its clip, or overlaps a shot already used, is listed
under `skipped` in the plan instead of being clamped off the beat.

## Development

```bash
npm install
npm test          # node:test, no media needed
npm run typecheck
npm run smoke     # end-to-end render on generated test-pattern video and a click track
```

## Scope and data

- Runs entirely on your machine. No network calls, no accounts, no telemetry.
- Processes only the media files you point it at; it stores nothing about anyone.
- No machine-learning models: beat detection is plain signal processing.
- Ships no third-party media. Tests and the smoke run generate synthetic input.

## License

MIT © 2026 Branislav Milke
