#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { detectBeats } from './beats.ts';
import { decodeMono } from './media.ts';
import { makeEdit, prepareEdit } from './pipeline.ts';
import { parseProject, type Project } from './project.ts';

const USAGE = `usage:
  beatcut analyze <song>                  print the beat grid
  beatcut plan <project.json>             print the edit plan
  beatcut render <project.json> <out.mp4> render the edit (writes <out>.plan.json too)`;

async function loadProject(path: string): Promise<Project> {
  return parseProject(JSON.parse(await readFile(path, 'utf8')), path);
}

async function main(argv: string[]): Promise<void> {
  const [command, a, b] = argv;
  if (command === 'analyze' && a) {
    console.log(JSON.stringify(detectBeats(await decodeMono(a)), null, 2));
  } else if (command === 'plan' && a) {
    console.log(JSON.stringify((await prepareEdit(await loadProject(a))).plan, null, 2));
  } else if (command === 'render' && a && b) {
    const edit = await makeEdit(await loadProject(a), b);
    await writeFile(`${b}.plan.json`, JSON.stringify(edit, null, 2));
    console.error(`${b}: ${edit.shots.length} shots, ${(edit.durationMs / 1000).toFixed(1)} s at ${edit.bpm} BPM` +
      (edit.skipped.length ? `, ${edit.skipped.length} moments skipped` : ''));
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
