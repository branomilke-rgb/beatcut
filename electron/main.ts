/**
 * Desktop app: one window, files read straight from disk by path (nothing is
 * copied or sent anywhere), the edit is rendered into the temp folder and saved
 * where the user picks.
 */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { makeEdit } from '../src/pipeline.ts';
import { AUDIO_EXT, parseEditRequest, VIDEO_EXT } from './request.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const lastEdit = new Map<number, string>();

async function describe(paths: string[]) {
  return Promise.all(paths.map(async path => ({ path, name: basename(path), size: (await stat(path)).size })));
}

function windowOf(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('NO_WINDOW');
  return win;
}

ipcMain.handle('files:pick', async (event, kind: unknown) => {
  const clips = kind === 'clips';
  const picked = await dialog.showOpenDialog(windowOf(event), {
    properties: clips ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [clips ? { name: 'Video', extensions: VIDEO_EXT } : { name: 'Audio', extensions: AUDIO_EXT }],
  });
  return picked.canceled ? [] : describe(picked.filePaths);
});

ipcMain.handle('files:describe', (_event, paths: unknown) =>
  describe(Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : []));

ipcMain.handle('edit:make', async (event, input: unknown) => {
  const request = parseEditRequest(input);
  const dir = join(app.getPath('temp'), 'beatcut', randomUUID());
  await mkdir(dir, { recursive: true });
  const out = join(dir, 'edit.mp4');
  const plan = await makeEdit(request, out, stage => event.sender.send('edit:stage', stage));
  lastEdit.set(event.sender.id, out);
  return {
    videoUrl: pathToFileURL(out).href,
    shots: plan.shots.length,
    durationMs: plan.durationMs,
    bpm: plan.bpm,
    clipsUsed: new Set(plan.shots.map(s => s.clipId)).size,
  };
});

ipcMain.handle('edit:save', async event => {
  const source = lastEdit.get(event.sender.id);
  if (!source) throw new Error('NOTHING_TO_SAVE');
  const target = await dialog.showSaveDialog(windowOf(event), {
    defaultPath: join(app.getPath('videos'), 'beatcut-edit.mp4'),
    filters: [{ name: 'Video', extensions: ['mp4'] }],
  });
  if (target.canceled || !target.filePath) return null;
  await copyFile(source, target.filePath);
  return target.filePath;
});

function open(): BrowserWindow {
  const win = new BrowserWindow({
    width: 760,
    height: 900,
    minWidth: 420,
    backgroundColor: '#0e0f12',
    title: 'beatcut',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Nothing in the window may navigate away or open new windows.
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void win.loadFile(join(ROOT, 'public', 'index.html'));
  return win;
}

app.whenReady().then(async () => {
  const win = open();
  const selftest = process.env.BEATCUT_SELFTEST;
  if (selftest) {
    const { runSelftest } = await import('./selftest.ts');
    await runSelftest(win, selftest);
  }
});
app.on('window-all-closed', () => app.quit());
