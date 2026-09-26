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
