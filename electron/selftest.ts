/**
 * `BEATCUT_SELFTEST=<dir>`: drives the real window with clip*.mp4 + song.wav from
 * <dir>, waits for the edit, saves screenshots and a report there, then quits.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function runSelftest(win: BrowserWindow, dir: string): Promise<void> {
  const report: Record<string, unknown> = {};
  try {
    if (win.webContents.isLoading()) await new Promise<void>(r => win.webContents.once('did-finish-load', () => r()));
    const files = await readdir(dir);
    const clips = files.filter(f => /^clip\d+\.mp4$/.test(f)).sort().map(f => join(dir, f));
    const song = join(dir, 'song.wav');
    const js = (code: string) => win.webContents.executeJavaScript(code);

    await js(`(async () => {
      clips = await window.beatcut.describe(${JSON.stringify(clips)});
      song = (await window.beatcut.describe([${JSON.stringify(song)}]))[0];
      document.querySelector('[name=length][value="15"]').click();
      refresh();
    })()`);
    await wait(300);
    await writeFile(join(dir, 'selftest-form.png'), (await win.webContents.capturePage()).toPNG());

    await js(`document.getElementById('go').click()`);
    const seen = new Set<string>();
    for (let i = 0; i < 240; i++) {
      seen.add(await js(`document.getElementById('status-text').textContent`));
      if (!(await js(`document.getElementById('result').hidden`))) break;
      await wait(250);
    }
    await wait(1500);
    report.statuses = [...seen];
    report.meta = await js(`document.getElementById('meta').textContent`);
    report.video = await js(`(() => { const v = document.getElementById('player'); return { src: v.src, readyState: v.readyState, duration: v.duration, width: v.videoWidth, height: v.videoHeight }; })()`);
    await writeFile(join(dir, 'selftest-result.png'), (await win.webContents.capturePage()).toPNG());
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }
  await writeFile(join(dir, 'selftest.json'), JSON.stringify(report, null, 2));
  app.quit();
}
