const { execFile } = require('child_process');
const http = require('http');
const https = require('https');

const GAME_PROCESS = 'CrimsonDesert.exe';
const ATLAS_SERVICE_PROCESS = 'CrimsonAtlasService.exe';

const DEFAULT_PROBES = [
  'http://127.0.0.1:17893/v1/player',
  'http://127.0.0.1:17893/player',
  'http://127.0.0.1:17893/v1/status',
  'http://127.0.0.1:17893/health'
];

function probeUrl(url, timeoutMs = 700) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let parsed;
    try { parsed = new URL(url); } catch {
      finish({ ok: false, url, error: 'INVALID_URL' });
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(parsed, { timeout: timeoutMs, headers: { accept: 'application/json' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = body ? JSON.parse(body) : null; } catch {}
        finish({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          url,
          statusCode: res.statusCode,
          json,
          contentType: res.headers['content-type'] || null
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', err => finish({ ok: false, url, error: err?.code || err?.message || 'REQUEST_FAILED' }));
  });
}

function tasklist() {
  return new Promise(resolve => {
    execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 2000 }, (error, stdout) => {
      if (error) return resolve([]);
      const rows = String(stdout || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const names = [];
      for (const row of rows) {
        const match = row.match(/^"([^"]+)"/);
        if (match?.[1]) names.push(match[1].toLowerCase());
      }
      resolve(names);
    });
  });
}

function normalizePosition(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload.position,
    payload.player?.position,
    payload.player,
    payload.data?.position,
    payload.data?.player?.position
  ].filter(Boolean);

  for (const c of candidates) {
    const x = Number(c.x);
    const y = Number(c.y);
    const z = Number(c.z);
    if ([x, y, z].every(Number.isFinite)) {
      return {
        x, y, z,
        heading: Number.isFinite(Number(c.heading)) ? Number(c.heading) : null,
        realm: c.realm || payload.realm || payload.data?.realm || null
      };
    }
  }
  return null;
}

function createBridge({ baseUrls = [], pollMs = 750 } = {}) {
  let timer = null;
  let running = false;
  const listeners = new Set();
  const probes = Array.from(new Set([...DEFAULT_PROBES, ...baseUrls].flatMap(u => [
    String(u).replace(/\/$/, '') + '/v1/player',
    String(u).replace(/\/$/, '') + '/player',
    String(u).replace(/\/$/, '') + '/v1/status',
    String(u).replace(/\/$/, '') + '/health'
  ])));

  const state = {
    phase: 'BOOTING',
    gameProcess: false,
    atlasService: false,
    atlasHttp: false,
    telemetry: 'OFFLINE',
    position: null,
    provider: null,
    lastUpdate: null,
    lastError: null,
    probes: []
  };

  const emit = patch => {
    Object.assign(state, patch);
    for (const listener of listeners) {
      try { listener({ ...state, position: state.position ? { ...state.position } : null, probes: [...state.probes] }); } catch {}
    }
  };

  async function poll() {
    if (running) return;
    running = true;
    try {
      const processes = await tasklist();
      const gameProcess = processes.includes(GAME_PROCESS.toLowerCase());
      const atlasService = processes.includes(ATLAS_SERVICE_PROCESS.toLowerCase());

      let httpResult = null;
      for (const url of probes) {
        const result = await probeUrl(url);
        state.probes.push({
          url,
          ok: result.ok,
          statusCode: result.statusCode || null,
          error: result.error || null,
          at: new Date().toISOString()
        });
        state.probes = state.probes.slice(-12);
        if (result.ok) {
          httpResult = result;
          break;
        }
      }

      const position = normalizePosition(httpResult?.json);
      let telemetry = 'OFFLINE';
      let phase = 'GAME_NOT_RUNNING';
      if (gameProcess) {
        phase = atlasService ? 'ATTACHING' : 'GAME_RUNNING';
        if (position) {
          telemetry = 'LIVE';
          phase = 'CONNECTED';
        } else if (httpResult?.ok) {
          telemetry = 'CONNECTED_NO_POSITION';
          phase = 'CONNECTED';
        } else if (atlasService) {
          telemetry = 'WAITING';
        } else {
          telemetry = 'NO_PROVIDER';
        }
      }

      if (!gameProcess) {
        emit({ gameProcess, atlasService, atlasHttp: Boolean(httpResult?.ok), telemetry, phase, provider: null, position: null, lastUpdate: new Date().toISOString(), lastError: null });
      } else {
        emit({
          gameProcess,
          atlasService,
          atlasHttp: Boolean(httpResult?.ok),
          telemetry,
          phase,
          provider: httpResult?.url || null,
          position: position || state.position,
          lastUpdate: new Date().toISOString(),
          lastError: null
        });
      }
    } catch (err) {
      emit({ phase: 'ERROR', telemetry: 'ERROR', lastError: err?.message || String(err), lastUpdate: new Date().toISOString() });
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      poll();
      timer = setInterval(poll, Math.max(500, pollMs));
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    getState() {
      return { ...state, position: state.position ? { ...state.position } : null, probes: [...state.probes] };
    },
    onState(callback) {
      listeners.add(callback);
      callback(this.getState());
      return () => listeners.delete(callback);
    },
    refresh() {
      return poll();
    }
  };
}

module.exports = {
  GAME_PROCESS,
  ATLAS_SERVICE_PROCESS,
  createBridge
};
