# beatcut

A minimal beat-synced highlight editor. Open the app, drop up to 6 gameplay clips and
a song, and get one edit where every highlight lands on a beat.

Deliberately small: hard cuts only, no effects, no slow motion, no transitions.

```
song ──► beats.ts   (onset envelope → tempo → beat grid)
clips ─► moments.ts (loudest spots of each clip's audio, unless you mark them)
       ► plan.ts    (each moment on a beat, whole-beat shots, round robin over clips)
       ► render.ts  (one ffmpeg command: crop to format, concat, game audio under the song)
```

## Requirements

- Node.js ≥ 22.18 (runs the TypeScript directly, no build step)
- `ffmpeg` and `ffprobe` on `PATH`

## App

```bash
npm start   # http://localhost:3200
```

One page (`public/index.html`): clips, song, format (9:16 / 16:9 / 1:1), length
(15 / 30 / 60 s), game and music volume → progress → player and download.
The server (`src/server.ts`) listens on 127.0.0.1 only and keeps every file in
`out/jobs/<id>/`.

## CLI

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
`moments` is optional; without it the clip's loudest spots are used.
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
