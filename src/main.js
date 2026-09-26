const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { autoUpdater } = require('electron-updater');

let win;
let db;
let logFile;
let updaterState = {
  status: 'IDLE',
  message: 'Updater ready',
  version: app.getVersion(),
  downloaded: false,
  error: null
};

function dataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function emitUpdaterState(extra = {}) {
  updaterState = { ...updaterState, ...extra, version: app.getVersion() };
  if (win && !win.isDestroyed()) win.webContents.send('updater:state', updaterState);
  console.log('Updater state', updaterState);
}

function initLogging() {
  const logsDir = app.getPath('logs');
  fs.mkdirSync(logsDir, { recursive: true });
  logFile = path.join(logsDir, 'crimson-age.log');

  const write = (level, args) => {
    const line = `[${new Date().toISOString()}] ${level} ${args.map(v => {
      if (v instanceof Error) return v.stack || v.message;
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch { return String(v); }
    }).join(' ')}\n`;
    try { fs.appendFileSync(logFile, line, 'utf8'); } catch {}
  };

  for (const [name, fn] of [['log', console.log], ['warn', console.warn], ['error', console.error]]) {
    console[name] = (...args) => { write(name.toUpperCase(), args); fn(...args); };
  }

  process.on('uncaughtException', err => write('UNCAUGHT_EXCEPTION', [err]));
  process.on('unhandledRejection', reason => write('UNHANDLED_REJECTION', [reason]));
  console.log('Crimson Age session started', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    logFile
  });
}

function initDb() {
  fs.mkdirSync(dataDir(), { recursive: true });
  const dbPath = path.join(dataDir(), 'crimson-age.db');

  db = new Database(dbPath);
  db.pragma('journal_mode=WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS player_state(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ca_record(
      ca_id TEXT PRIMARY KEY,
      type TEXT,
      name TEXT,
      region TEXT,
      status TEXT NOT NULL DEFAULT 'UNKNOWN',
      denominator INTEGER NOT NULL DEFAULT 0,
      data_json TEXT
    );
    CREATE TABLE IF NOT EXISTS save_baseline(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      last_modified TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const count = db.prepare('SELECT COUNT(*) n FROM player_state').get().n;
  if (!count) {
    db.prepare('INSERT INTO player_state(id,json) VALUES(1,?)')
      .run(JSON.stringify({ phase: 'D1', finalPhase: 'D10', items: [] }));
  }
}

function analyzeSaveStructure(filePath) {
  const stat = fs.statSync(filePath);
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const printable = b => Array.from(b, c => c >= 32 && c <= 126 ? String.fromCharCode(c) : '.').join('');

  const strings = [];
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const ok = i < buf.length && buf[i] >= 32 && buf[i] <= 126;
    if (ok && start < 0) start = i;
    if ((!ok || i === buf.length) && start >= 0) {
      const end = i;
      if (end - start >= 6) strings.push({ offset: start, length: end - start, value: buf.subarray(start, end).toString('utf8').slice(0, 160) });
      start = -1;
    }
  }

  const interesting = strings.filter(x => /savedGameVersion|KnowledgeSaveData|QuestSaveData|HMAC|main.?quest|version/i.test(x.value)).slice(0, 80);
  const candidates = [];
  const scanLimit = Math.min(buf.length, 1024 * 1024);
  for (let o = 0; o + 8 <= scanLimit; o += 4) {
    const dataOffset = buf.readUInt32LE(o);
    const length = buf.readUInt32LE(o + 4);
    if (dataOffset > 0 && dataOffset < buf.length && length >= 4 && length <= buf.length * 0.25 && dataOffset + length <= buf.length) {
      candidates.push({ offset: o, dataOffset, length });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.dataOffset + ':' + c.length;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
    if (unique.length >= 40) break;
  }

  const headerSize = Math.min(64, buf.length);
  let savedGameVersion = null;
  const marker = strings.find(x => /savedGameVersion/i.test(x.value));
  if (marker) {
    const nearby = strings.find(x => x.offset > marker.offset && x.offset - marker.offset < 256 && /\d+\./.test(x.value));
    savedGameVersion = nearby?.value || marker.value;
  }

  return {
    fileName: path.basename(filePath),
    fileSize: stat.size,
    lastModified: stat.mtime.toISOString(),
    sha256,
    readOnly: true,
    format: {
      headerBytesInspected: headerSize,
      headerHex: buf.subarray(0, headerSize).toString('hex'),
      headerAscii: printable(buf.subarray(0, Math.min(32, buf.length))),
      candidatePointerLengthPairs: unique
    },
    strings: { printableStringCount: strings.length, interesting },
    known: {
      savedGameVersion,
      semanticMappings: 'CONTROLLED_LIMITATION: semantic type/pointer mapping is not inferred by this analyzer.'
    },
    integrity: {
      sha256: 'PASS',
      sourceFileModified: false,
      hmac: 'NOT_RECALCULATED'
    },
    analyzer: {
      mode: 'READ_ONLY_STRUCTURAL',
      heuristicCandidates: true,
      note: 'Pointer/length candidates are structural hints, not confirmed schema records.'
    }
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '../public/index.html'));
}

function configureUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  if (!app.isPackaged) {
    emitUpdaterState({
      status: 'DEV_NOT_PACKAGED',
      message: 'Update checks are enabled in packaged Windows builds.'
    });
    return;
  }

  autoUpdater.on('checking-for-update', () =>
    emitUpdaterState({ status: 'CHECKING', message: 'Checking GitHub for updates…', error: null })
  );
  autoUpdater.on('update-available', info =>
    emitUpdaterState({
      status: 'UPDATE_AVAILABLE',
      message: `Version ${info.version} is available.`,
      availableVersion: info.version,
      releaseName: info.releaseName || ''
    })
  );
  autoUpdater.on('update-not-available', info =>
    emitUpdaterState({
      status: 'UP_TO_DATE',
      message: `Already on the latest version (${info.version}).`,
      availableVersion: null,
      downloaded: false,
      error: null
    })
  );
  autoUpdater.on('download-progress', p =>
    emitUpdaterState({
      status: 'DOWNLOADING',
      message: `Downloading update… ${Math.round(p.percent)}%`,
      progress: Math.round(p.percent),
      downloaded: false
    })
  );
  autoUpdater.on('update-downloaded', info =>
    emitUpdaterState({
      status: 'READY_TO_INSTALL',
      message: `Update ${info.version} is ready. Restart to install.`,
      availableVersion: info.version,
      downloaded: true,
      progress: 100,
      error: null
    })
  );
  autoUpdater.on('error', err =>
    emitUpdaterState({
      status: 'ERROR',
      message: err?.message || 'Update failed.',
      error: err?.stack || String(err)
    })
  );
}

ipcMain.handle('db:getState', () => {
  console.log('IPC db:getState');
  return JSON.parse(db.prepare('SELECT json FROM player_state WHERE id=1').get().json);
});

ipcMain.handle('db:setState', (_, state) => {
  console.log('IPC db:setState', { itemCount: Array.isArray(state?.items) ? state.items.length : 0 });
  db.prepare('UPDATE player_state SET json=? WHERE id=1').run(JSON.stringify(state));
  return true;
});

ipcMain.handle('db:info', () => {
  console.log('IPC db:info');
  return {
    path: path.join(dataDir(), 'crimson-age.db'),
    records: db.prepare('SELECT COUNT(*) n FROM ca_record').get().n,
    baselines: db.prepare('SELECT COUNT(*) n FROM save_baseline').get().n,
    logsPath: app.getPath('logs'),
    version: app.getVersion()
  };
});

ipcMain.handle('save:listBaselines', () => {
  console.log('IPC save:listBaselines');
  return db.prepare(`
    SELECT id, label, file_name AS fileName, file_path AS filePath,
           file_size AS fileSize, last_modified AS lastModified,
           sha256, created_at AS createdAt
    FROM save_baseline
    ORDER BY id DESC
  `).all();
});

ipcMain.handle('save:pick', async () => {
  console.log('IPC save:pick opened');

  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Save files', extensions: ['save', 'bin', 'dat'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    console.log('Save picker canceled');
    return null;
  }

  const filePath = result.filePaths[0];
  const stat = await fs.promises.stat(filePath);

  const sha256 = await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });

  const baseline = {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    lastModified: stat.mtime.toISOString(),
    sha256,
    readOnly: true,
    status: 'BASELINE_READY'
  };

  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO save_baseline(label,file_name,file_path,file_size,last_modified,sha256,created_at)
    VALUES(?,?,?,?,?,?,?)
  `).run(null, baseline.name, baseline.path, baseline.size,
         baseline.lastModified, baseline.sha256, createdAt);

  console.log('Save baseline captured', {
    file: baseline.name,
    size: baseline.size,
    sha256: baseline.sha256,
    readOnly: baseline.readOnly
  });

  return { ...baseline, createdAt };
});


function compareSaveFiles(firstPath, secondPath) {
  if (!firstPath || !secondPath) throw new Error('Two save files are required.');
  if (!fs.existsSync(firstPath) || !fs.existsSync(secondPath)) throw new Error('One or both save files no longer exist.');

  const first = fs.readFileSync(firstPath);
  const second = fs.readFileSync(secondPath);
  const firstSha256 = crypto.createHash('sha256').update(first).digest('hex');
  const secondSha256 = crypto.createHash('sha256').update(second).digest('hex');
  const minLength = Math.min(first.length, second.length);
  const chunkSize = 64;
  const changedChunks = [];
  let changedBytes = 0;
  let firstChangedOffset = null;
  let lastChangedOffset = null;

  for (let offset = 0; offset < minLength; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, minLength);
    let different = false;
    for (let i = offset; i < end; i++) {
      if (first[i] !== second[i]) {
        different = true;
        changedBytes++;
        if (firstChangedOffset === null) firstChangedOffset = i;
        lastChangedOffset = i;
      }
    }
    if (different) changedChunks.push({ offset, length: end - offset });
  }

  if (first.length !== second.length) {
    const start = minLength;
    const extraLength = Math.abs(first.length - second.length);
    changedBytes += extraLength;
    if (firstChangedOffset === null) firstChangedOffset = start;
    lastChangedOffset = Math.max(start, Math.max(first.length, second.length) - 1);
    changedChunks.push({ offset: start, length: extraLength, sizeChanged: true });
  }

  return {
    mode: 'READ_ONLY_BINARY_DIFF',
    first: {
      fileName: path.basename(firstPath),
      fileSize: first.length,
      sha256: firstSha256
    },
    second: {
      fileName: path.basename(secondPath),
      fileSize: second.length,
      sha256: secondSha256
    },
    changed: firstSha256 !== secondSha256,
    changedBytes,
    changedChunkCount: changedChunks.length,
    firstChangedOffset,
    lastChangedOffset,
    changedChunks: changedChunks.slice(0, 200),
    note: 'Byte-level differences are observations only. No semantic meaning is inferred.'
  };
}

ipcMain.handle('save:analyzeStructure', (_, filePath) => {
  console.log('IPC save:analyzeStructure', filePath);
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Save file no longer exists.');
  return analyzeSaveStructure(filePath);
});

ipcMain.handle('save:compare', (_, firstPath, secondPath) => {
  console.log('IPC save:compare', { firstPath, secondPath });
  return compareSaveFiles(firstPath, secondPath);
});

ipcMain.handle('open:path', (_, targetPath) => {
  console.log('IPC open:path', targetPath);
  return shell.openPath(targetPath);
});

ipcMain.handle('updater:status', () => updaterState);

ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) {
    emitUpdaterState({
      status: 'DEV_NOT_PACKAGED',
      message: 'Build and run the Windows package to test GitHub updates.'
    });
    return updaterState;
  }

  try {
    emitUpdaterState({ status: 'CHECKING', message: 'Checking GitHub for updates…', error: null });
    await autoUpdater.checkForUpdates();
    return updaterState;
  } catch (err) {
    emitUpdaterState({
      status: 'ERROR',
      message: err?.message || 'Update check failed.',
      error: err?.stack || String(err)
    });
    return updaterState;
  }
});

ipcMain.handle('updater:download', async () => {
  if (!app.isPackaged) return updaterState;

  if (updaterState.status !== 'UPDATE_AVAILABLE') return updaterState;

  try {
    emitUpdaterState({ status: 'DOWNLOADING', message: 'Starting update download…', progress: 0 });
    await autoUpdater.downloadUpdate();
    return updaterState;
  } catch (err) {
    emitUpdaterState({
      status: 'ERROR',
      message: err?.message || 'Update download failed.',
      error: err?.stack || String(err)
    });
    return updaterState;
  }
});

ipcMain.handle('updater:install', () => {
  if (!app.isPackaged || !updaterState.downloaded) return false;
  console.log('Installing downloaded update and restarting');
  autoUpdater.quitAndInstall(false, true);
  return true;
});

app.whenReady().then(() => {
  initLogging();
  initDb();
  createWindow();
  configureUpdater();
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});
