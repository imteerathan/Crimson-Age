let state;
let view = 'home';
let lastBaseline = null;
let lastAnalysis = null;
let lastDiff = null;
let lastContainerAnalysis = null;
let lastRawDiff = null;
let correlationSearch = '';
let updater = { status: 'IDLE', message: 'Updater ready', version: '' };
let horizon = { phase: 'BOOTING', gameProcess: false, atlasService: false, atlasHttp: false, telemetry: 'OFFLINE', position: null, provider: null, lastUpdate: null, lastError: null, probes: [] };

const app = document.querySelector('#app');
const updateButton = document.querySelector('#update');
const appVersion = document.querySelector('#app-version');

const seed = [
  { id: 'CA-D1-001', title: 'Verify local database', status: 'PLANNED' },
  { id: 'CA-D1-002', title: 'Connect Crimson Route adapter', status: 'UNKNOWN' },
  { id: 'CA-D1-003', title: 'Test real save read-only import', status: 'UNKNOWN' }
];

async function save() {
  await window.crimsonAge.setState(state);
}

async function boot() {
  try {
    state = await window.crimsonAge.getState();
    if (!Array.isArray(state.items) || state.items.length === 0) {
      state.items = seed;
      await save();
    }

    updater = await window.crimsonAge.updaterStatus();
    horizon = await window.crimsonAge.getHorizonGameState();
    bindUpdater();
    await render();
  } catch (err) {
    console.error('Crimson Atlas Horizon boot failed', err);
    app.innerHTML = `<div class="card"><h1>Crimson Atlas Horizon startup error</h1><p>${esc(err?.message || err)}</p></div>`;
  }
}

function horizonBadge(value) {
  const map = {
    CONNECTED: 'LIVE',
    ATTACHING: 'ATTACHING',
    GAME_RUNNING: 'GAME RUNNING',
    GAME_NOT_RUNNING: 'GAME CLOSED',
    NO_PROVIDER: 'NO TELEMETRY',
    WAITING: 'WAITING FOR TELEMETRY',
    CONNECTED_NO_POSITION: 'CONNECTED / NO POSITION',
    OFFLINE: 'OFFLINE',
    ERROR: 'ERROR'
  };
  return map[value] || value || 'UNKNOWN';
}

function renderHorizonDashboard() {
  const p = horizon.position;
  const fmt = v => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';
  return `
    <div class="card horizon-card">
      <div class="section-title">Horizon Live Connection</div>
      <div class="horizon-status-grid">
        <div><span class="muted">Game</span><strong>${horizon.gameProcess ? 'RUNNING' : 'CLOSED'}</strong></div>
        <div><span class="muted">Atlas Service</span><strong>${horizon.atlasService ? 'DETECTED' : 'NOT DETECTED'}</strong></div>
        <div><span class="muted">Telemetry</span><strong>${horizonBadge(horizon.telemetry)}</strong></div>
        <div><span class="muted">Phase</span><strong>${esc(horizon.phase)}</strong></div>
      </div>
      <div class="kv horizon-position">
        <div>Provider</div><code>${esc(horizon.provider || '—')}</code>
        <div>Realm</div><span>${esc(p?.realm || '—')}</span>
        <div>X</div><span>${fmt(p?.x)}</span>
        <div>Y</div><span>${fmt(p?.y)}</span>
        <div>Z</div><span>${fmt(p?.z)}</span>
        <div>Last Update</div><span>${esc(horizon.lastUpdate || '—')}</span>
      </div>
      <p class="muted">${esc(horizon.lastError || 'Game detection runs automatically. Live coordinates appear when a supported local telemetry provider is available.')}</p>
      <button id="refreshHorizon">Refresh Connection</button>
      <button id="toggleHorizonOverlay" style="margin-left:8px">Show / Hide Overlay</button>
    </div>`;
}

function bindHorizon() {
  window.crimsonAge.onHorizonGameState(async next => {
    horizon = next;
    await render();
  });
  const refreshButton = document.querySelector('#refreshHorizon');
  if (refreshButton) refreshButton.onclick = async () => {
    refreshButton.disabled = true;
    try { horizon = await window.crimsonAge.refreshHorizonGameState(); await render(); }
    catch (err) { alert(err?.message || String(err)); }
    finally { const b = document.querySelector('#refreshHorizon'); if (b) b.disabled = false; }
  };
  const toggleButton = document.querySelector('#toggleHorizonOverlay');
  if (toggleButton) toggleButton.onclick = async () => {
    try { await window.crimsonAge.toggleHorizonOverlay(); } catch (err) { alert(err?.message || String(err)); }
  };
}

function bindUpdater() {
  updateButton.onclick = async () => {
    updateButton.disabled = true;
    updateButton.textContent = 'Checking…';
    try {
      updater = await window.crimsonAge.checkForUpdates();

      if (updater.status === 'UPDATE_AVAILABLE') {
        const availableVersion = updater.availableVersion ? `v${updater.availableVersion}` : 'unknown version';
        if (confirm(`Crimson Atlas Horizon ${availableVersion} is available. Download now?`)) {
          updater = await window.crimsonAge.downloadUpdate();
        }
      }

      if (updater.status === 'READY_TO_INSTALL') {
        if (confirm('Update downloaded. Restart Crimson Atlas Horizon and install it now?')) {
          await window.crimsonAge.installUpdate();
          return;
        }
      }

      await render();
    } catch (err) {
      console.error('Update UI failed', err);
      alert(err?.message || String(err));
    } finally {
      updateButton.disabled = false;
      updateButton.textContent = 'Check for Updates';
    }
  };

  window.crimsonAge.onUpdaterState(async next => {
    updater = next;
    if (updater.status === 'READY_TO_INSTALL') {
      updateButton.textContent = 'Restart to Update';
    } else if (updater.status === 'DOWNLOADING') {
      updateButton.textContent = `Downloading ${updater.progress || 0}%`;
    } else if (updater.status === 'CHECKING') {
      updateButton.textContent = 'Checking…';
    } else {
      updateButton.textContent = 'Check for Updates';
    }
    await render();
  });
}

function nav(nextView) {
  console.log('UI navigation', nextView);
  view = nextView;
  render().catch(err => {
    console.error('Render failed', err);
    app.innerHTML = `<div class="card"><h1>Render error</h1><p>${esc(err?.message || err)}</p></div>`;
  });
}

document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => nav(button.dataset.view);
});

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtBytes(value) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = Number(value);
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 2 : 0)} ${units[i]}`;
}

function updaterCard() {
  const status = esc(updater.status || 'IDLE');
  const message = esc(updater.message || 'Updater ready');
  const currentVersion = esc(updater.version || '—');
  const availableVersion = updater.availableVersion ? esc(updater.availableVersion) : '—';
  const progress = Number.isFinite(updater.progress) ? `${updater.progress}%` : '';

  return `
    <div class="card update-card">
      <div class="section-title">Software Update</div>
      <div class="update-row"><span>Status</span><strong>${status}</strong></div>
      <div class="update-row"><span>Current Version</span><strong>${currentVersion}</strong></div>
      <div class="update-row"><span>Available Update</span><strong>${availableVersion}</strong></div>
      <p class="muted">${message}</p>
      ${progress ? `<div class="progress"><span style="width:${progress}"></span></div>` : ''}
      ${updater.status === 'READY_TO_INSTALL' ? '<button id="restartUpdate">Restart & Install Update</button>' : ''}
    </div>`;
}
async function render() {
  const info = await window.crimsonAge.dbInfo();
  if (appVersion) appVersion.textContent = `v${info.version || '—'}`;
  let html = '';

  if (view === 'home') {
    html = `
      <h1>Crimson Atlas Horizon</h1>
      <p class="muted">Windows · Crimson Atlas companion · version ${esc(info.version)}</p>
      ${renderHorizonDashboard()}
      ${updaterCard()}
      <div class="grid">
        <div class="card"><div class="muted">Current Phase</div><div class="big">D1</div></div>
        <div class="card"><div class="muted">Database</div><div>${info.records} canonical records</div></div>
        <div class="card"><div class="muted">Save Baselines</div><div>${info.baselines}</div></div>
        <div class="card"><div class="muted">Logs</div><div>${esc(info.logsPath)}</div></div>
      </div>
      <br>
      <div class="card">
        <h2>What Should I Do Now?</h2>
        <p>Start Crimson Desert with Atlas running. Horizon will detect the game automatically, then display connection and live telemetry state.</p>
      </div>`;
  } else if (view === 'playbook') {
    html = `
      <h1>Playbook</h1>
      <div class="list">
        <div class="item">HORIZON · Extension Foundation <b>IN PROGRESS</b></div>
        <div class="item">ATLAS BRIDGE · Save evidence <b>VERIFIED</b>
        <div class="item">ATLAS BRIDGE · Save diff <b>VERIFIED</b></div></div>
        <div class="item">ATLAS BRIDGE · Binary analyzer <b>VERIFIED</b></div>
        <div class="item">ATLAS BRIDGE · Container decoder <b>VERIFIED</b></div>
        <div class="item">ATLAS BRIDGE · Object correlation <b>VERIFIED</b></div>
        <div class="item">ATLAS BRIDGE · Safe field values <b>IN PROGRESS</b></div>
        <div class="item">D2 · Crimson Atlas Horizon Core <b>PLANNED</b></div>
        <div class="item">ATLAS DATA BRIDGE <b>PLANNED</b></div>
        <div class="item">LIVE MAP <b>PLANNED</b></div>
        <div class="item">COMPLETION EVIDENCE <b>PLANNED</b></div>
        <div class="item">NAVIGATION BRIDGE <b>PLANNED</b></div>
        <div class="item">OVERLAY <b>PLANNED</b></div>
      </div>`;
  } else if (view === 'map') {
    html = `
      <h1>Interactive Map · D1</h1>
      <p class="muted">Placeholder renderer only. Real game map tiles and coordinates are intentionally not fabricated.</p>
      <div class="map"><span class="player"></span><span class="marker m1"></span><span class="marker m2"></span><span class="marker m3"></span></div>`;
  } else if (view === 'checklist') {
    html = `
      <h1>Checklist</h1>
      <div class="list">
        ${state.items.map((item, index) => `
          <div class="item">
            <div><b>${esc(item.id)}</b><div>${esc(item.title)}</div></div>
            <select data-i="${index}">
              <option ${item.status === 'UNKNOWN' ? 'selected' : ''}>UNKNOWN</option>
              <option ${item.status === 'PLANNED' ? 'selected' : ''}>PLANNED</option>
              <option ${item.status === 'IN_PROGRESS' ? 'selected' : ''}>IN_PROGRESS</option>
              <option ${item.status === 'VERIFIED' ? 'selected' : ''}>VERIFIED</option>
              <option ${item.status === 'BLOCKED' ? 'selected' : ''}>BLOCKED</option>
            </select>
          </div>`).join('')}
      </div>`;
  } else if (view === 'save') {
    const baselines = await window.crimsonAge.listBaselines();
    const analysisCard = lastAnalysis ? renderAnalysis(lastAnalysis) : '';
    const diffCard = lastDiff ? renderDiff(lastDiff) : '';
    const containerCard = lastContainerAnalysis ? renderContainerAnalysis(lastContainerAnalysis) : '';
    const rawDiffCard = lastRawDiff ? renderRawDiff(lastRawDiff) : '';
    const snapshotBaselines = baselines.filter(b => b.snapshotPath);
    const history = baselines.length
      ? `<div class="card" style="margin-top:14px"><h3>Baseline History</h3>${baselines.map((b, i) => `
          <div class="item">
            <div>
              <b>${esc(b.label || `Baseline #${b.id}`)}</b>
              <div class="muted">${esc(b.createdAt)} · ${fmtBytes(b.fileSize)} · ${b.snapshotPath ? 'IMMUTABLE SNAPSHOT' : 'LEGACY / NO SNAPSHOT'}</div>
              <code>${esc(b.sha256)}</code>
            </div>
            <span>${i === 0 ? 'LATEST' : ''}</span>
          </div>`).join('')}</div>`
      : '';

    html = `
      <h1>Save Analyzer</h1>
      <p class="muted">Read-only baseline inspection. Crimson Atlas Horizon never writes to the selected game save.</p>
      <button id="pick">Select save file</button>
      ${lastBaseline ? '<button id="analyze" style="margin-left:8px">Analyze Binary Structure</button><button id="analyzeContainer" style="margin-left:8px">Decode SAVE Container</button>' : ''}
      <div id="picked" class="card" style="margin-top:14px">${lastBaseline ? renderBaseline(lastBaseline) : 'No new file selected in this session.'}</div>
      ${snapshotBaselines.length >= 2 ? '<button id="compareLatest" style="margin-left:8px">Compare Latest Two Baselines</button><button id="compareRawLatest" style="margin-left:8px">Compare Decoded PARC Payloads</button>' : ''}
      <button id="exportData" style="margin-left:8px">Export Field Test Data</button>
      ${analysisCard}${containerCard}${diffCard}${rawDiffCard}${history}`;
  } else {
    html = `
      <h1>Local Database</h1>
      <div class="card">
        <p>SQLite path</p><code>${esc(info.path)}</code>
        <p>Log path</p><code>${esc(info.logsPath)}</code>
        <p class="muted">Database and logs are stored locally in the user profile.</p>
      </div>`;
  }

  app.innerHTML = html;

  if (view === 'home') bindHorizon();
  bindCorrelationSearch();

  document.querySelectorAll('select[data-i]').forEach(select => {
    select.onchange = async event => {
      try {
        const index = Number(event.target.dataset.i);
        state.items[index].status = event.target.value;
        await save();
        console.log('Checklist status saved', { id: state.items[index].id, status: state.items[index].status });
      } catch (err) {
        console.error('Checklist save failed', err);
        alert('Unable to save checklist status: ' + (err?.message || err));
      }
    };
  });

  const pick = document.querySelector('#pick');
  if (pick) {
    pick.onclick = async () => {
      const box = document.querySelector('#picked');
      pick.disabled = true;
      box.textContent = 'Reading file metadata and SHA-256…';

      try {
        const file = await window.crimsonAge.pickSave();
        if (!file) {
          box.textContent = 'No file selected.';
          return;
        }

        lastBaseline = file;
        lastAnalysis = null;
        lastDiff = null;
        lastRawDiff = null;
        correlationSearch = '';
        box.innerHTML = renderBaseline(file);
        console.log('Baseline selected in UI', file);
        await render();
      } catch (err) {
        console.error('Save baseline UI failed', err);
        box.textContent = 'Unable to analyze file: ' + (err?.message || err);
      } finally {
        pick.disabled = false;
      }
    };
  }

  const compareLatest = document.querySelector('#compareLatest');
  if (compareLatest) {
    compareLatest.onclick = async () => {
      compareLatest.disabled = true;
      compareLatest.textContent = 'Comparing…';
      try {
        const currentBaselines = await window.crimsonAge.listBaselines();
        const currentSnapshotBaselines = currentBaselines.filter(b => b && b.snapshotPath);
        if (currentSnapshotBaselines.length < 2) {
          throw new Error('At least two immutable baseline snapshots are required. Capture two new baselines after updating to v0.3.9+.');
        }
        lastDiff = await window.crimsonAge.compareSaves(
          currentSnapshotBaselines[1].snapshotPath,
          currentSnapshotBaselines[0].snapshotPath
        );
        console.log('Save baseline diff complete', { changed: lastDiff.changed, changedBytes: lastDiff.changedBytes, changedChunks: lastDiff.changedChunkCount });
        await render();
      } catch (err) {
        console.error('Save baseline diff failed', err);
        alert('Save baseline diff failed: ' + (err?.message || err));
      } finally {
        const button = document.querySelector('#compareLatest');
        if (button) { button.disabled = false; button.textContent = 'Compare Latest Two Baselines'; }
      }
    };
  }
  const exportData = document.querySelector('#exportData');
  if (exportData) {
    exportData.onclick = async () => {
      exportData.disabled = true;
      exportData.textContent = 'Exporting…';
      try {
        const result = await window.crimsonAge.exportFieldTestData();
        if (!result || result.canceled) return;
        alert(
          'Field test data exported successfully.\\n\\n' +
          'File: ' + result.path + '\\n' +
          'Size: ' + fmtBytes(result.bytes) + '\\n' +
          (result.changedChunks !== null && result.changedChunks !== undefined
            ? 'Diff chunks: ' + result.changedChunks + '\\n'
            : '') +
          'Full changed regions are included in the JSON export.'
        );
        console.log('Field test export complete', result);
      } catch (err) {
        console.error('Field test export failed', err);
        alert('Field test export failed: ' + (err?.message || err));
      } finally {
        exportData.disabled = false;
        exportData.textContent = 'Export Field Test Data';
      }
    };
  }

  const analyzeContainer = document.querySelector('#analyzeContainer');
  if (analyzeContainer) {
    analyzeContainer.onclick = async () => {
      analyzeContainer.disabled = true;
      analyzeContainer.textContent = 'Decoding…';
      try {
        lastContainerAnalysis = await window.crimsonAge.analyzeSaveContainer(lastBaseline.path);
        await render();
      } catch (err) {
        console.error('SAVE container decode failed', err);
        alert('SAVE container decode failed: ' + (err?.message || err));
      } finally {
        const button = document.querySelector('#analyzeContainer');
        if (button) { button.disabled = false; button.textContent = 'Decode SAVE Container'; }
      }
    };
  }

  const compareRawLatest = document.querySelector('#compareRawLatest');
  if (compareRawLatest) {
    compareRawLatest.onclick = async () => {
      compareRawLatest.disabled = true;
      compareRawLatest.textContent = 'Comparing…';
      try {
        const currentBaselines = await window.crimsonAge.listBaselines();
        const currentSnapshotBaselines = currentBaselines.filter(b => b && b.snapshotPath);
        if (currentSnapshotBaselines.length < 2) throw new Error('At least two immutable baseline snapshots are required.');
        lastRawDiff = await window.crimsonAge.compareDecodedSaves(currentSnapshotBaselines[1].snapshotPath, currentSnapshotBaselines[0].snapshotPath);
        await render();
      } catch (err) {
        console.error('Raw PARC diff failed', err);
        alert('Raw PARC diff failed: ' + (err?.message || err));
      } finally {
        const button = document.querySelector('#compareRawLatest');
        if (button) { button.disabled = false; button.textContent = 'Compare Decoded PARC Payloads'; }
      }
    };
  }

  const analyze = document.querySelector('#analyze');
  if (analyze) {
    analyze.onclick = async () => {
      analyze.disabled = true;
      analyze.textContent = 'Analyzing…';
      try {
        lastAnalysis = await window.crimsonAge.analyzeSaveStructure(lastBaseline.path);
        console.log('Binary structure analysis complete', {
          sha256: lastAnalysis.sha256,
          printableStrings: lastAnalysis.strings?.printableStringCount,
          candidates: lastAnalysis.format?.candidatePointerLengthPairs?.length
        });
        await render();
      } catch (err) {
        console.error('Binary structure analysis failed', err);
        alert('Binary structure analysis failed: ' + (err?.message || err));
      } finally {
        const button = document.querySelector('#analyze');
        if (button) {
          button.disabled = false;
          button.textContent = 'Analyze Binary Structure';
        }
      }
    };
  }

  const restart = document.querySelector('#restartUpdate');
  if (restart) {
    restart.onclick = async () => {
      await window.crimsonAge.installUpdate();
    };
  }
}

function renderContainerAnalysis(a) {
  if (a.exportError) return '<div class="card" style="margin-top:14px"><h3>SAVE Container Decoder · D1.5</h3><p class="muted">' + esc(a.exportError) + '</p></div>';
  return '<div class="card" style="margin-top:14px"><h3>SAVE Container Decoder · D1.5</h3>' +
    '<div class="kv">' +
    '<div>Mode</div><span>' + esc(a.mode) + '</span>' +
    '<div>File Size</div><span>' + fmtBytes(a.fileSize) + '</span>' +
    '<div>Raw Size</div><span>' + fmtBytes(a.rawSize) + '</span>' +
    '<div>Compression</div><span>' + esc(a.compression) + '</span>' +
    '<div>Decryption</div><span>' + esc(a.decryption) + '</span>' +
    '<div>HMAC</div><span>' + (a.hmacOk === true ? 'PASS' : a.hmacOk === false ? 'FAIL' : 'N/A') + '</span>' +
    '<div>Raw Magic</div><code>' + esc(a.rawMagic) + '</code>' +
    '<div>Schema Types</div><span>' + (a.schema?.typeCount ?? '—') + '</span>' +
    '<div>Root Type</div><span>' + esc(a.schema?.rootType || '—') + '</span>' +
    '<div>Schema Fingerprint</div><code>' + esc(a.schema?.fingerprint || '—') + '</code>' +
    '<div>TOC Entries</div><span>' + (a.toc?.entryCount ?? '—') + '</span>' +
    '<div>TOC Bounds</div><span>' + (a.toc?.boundsValid ? 'PASS' : 'CHECK') + '</span>' +
    '</div>' +
    (a.rawInterestingStrings?.length ? '<h4>Decoded markers</h4><div class="list">' + a.rawInterestingStrings.slice(0,40).map(x => '<div class="item"><code>0x' + x.offset.toString(16).padStart(8,'0') + '</code><span>' + esc(x.value) + '</span></div>').join('') + '</div>' : '<p class="muted">No known semantic markers found in decoded raw data.</p>') +
    '</div>';
}

function renderObjectCorrelation(c) {
  if (!c) return '';
  const objects = c.changedObjects || [];
  const classes = c.topChangedClasses || [];
  const q = correlationSearch.trim().toLowerCase();
  const matchesText = value => String(value ?? '').toLowerCase().includes(q);
  const fieldMatches = (f) => !q ||
    matchesText(f.name) || matchesText(f.typeName) || matchesText(f.status) ||
    matchesText(f.valueKind) || matchesText(f.firstValue) || matchesText(f.secondValue);
  const filteredObjects = q
    ? objects.filter(x =>
        matchesText(x.className) ||
        matchesText(x.classIndex) ||
        matchesText(x.firstEntryIndex) ||
        matchesText(x.secondEntryIndex) ||
        matchesText(x.changedBytes) ||
        (x.changedFixedFields || []).some(fieldMatches)
      )
    : objects;
  const filteredClasses = q
    ? classes.filter(x => matchesText(x.className) || matchesText(x.changedObjects) || matchesText(x.changedBytes))
    : classes;
  const displayedObjects = filteredObjects.slice(0, 100);
  const displayedClasses = filteredClasses.slice(0, 20);
  const resultText = q
    ? `Showing ${displayedObjects.length} of ${filteredObjects.length} matching objects`
    : `Showing ${displayedObjects.length} of ${objects.length} changed objects`;

  return '<div class="card" style="margin-top:14px"><h3>Save Object Correlation · D1.6 / D1.8</h3>' +
    '<div class="kv">' +
    '<div>Matched Objects</div><span>' + (c.matchedObjects ?? 0) + '</span>' +
    '<div>Changed Objects</div><span>' + (c.changedObjectCount ?? 0) + '</span>' +
    '<div>Added Objects</div><span>' + (c.addedObjects ?? 0) + '</span>' +
    '<div>Removed Objects</div><span>' + (c.removedObjects ?? 0) + '</span>' +
    '<div>Structural Changes</div><span>' + (c.structurallyChangedObjects ?? 0) + '</span>' +
    '<div>Offset-only shifts</div><span>' + (c.offsetShiftOnlyObjects ?? 0) + '</span>' +
    '<div>Field Mapping</div><span>' + esc(c.fieldMappingMode || '—') + '</span>' +
    '</div>' +
    '<div style="margin:12px 0"><input id="correlationSearch" type="search" value="' + esc(correlationSearch) + '" placeholder="Search classes, fields, types, or values…" style="width:100%;box-sizing:border-box"></div>' +
    (q ? '<p class="muted">' + esc(resultText) + '</p>' : '') +
    (displayedClasses.length ? '<h4>Changed classes</h4><div class="list">' +
      displayedClasses.map(x => '<div class="item"><b>' + esc(x.className) + '</b><span>objects=' + x.changedObjects + ' · bytes=' + x.changedBytes + '</span></div>').join('') +
      '</div>' : '<p class="muted">' + (q ? 'No changed classes match the search.' : 'No changed classes.') + '</p>') +
    (displayedObjects.length ? '<h4>Changed objects</h4><div class="list">' +
      displayedObjects.map(x => {
        const fields = (x.changedFixedFields || []).filter(fieldMatches);
        const displayFields = fields.length ? fields : (q ? [] : (x.changedFixedFields || []));
        return '<div class="item">' +
          '<div><b>' + esc(x.className) + '</b><div class="muted">entry ' + x.firstEntryIndex + ' → ' + x.secondEntryIndex +
          ' · bytes=' + x.changedBytes + ' · layout=' + (x.layoutSame ? 'stable' : 'changed') + '</div>' +
          (displayFields.length ? '<div class="muted">Fields: ' + displayFields.map(f => {
            const hasValues = (f.firstValue !== null && f.firstValue !== undefined) || (f.secondValue !== null && f.secondValue !== undefined);
            const values = hasValues ? ', ' + esc(String(f.firstValue ?? '—')) + ' → ' + esc(String(f.secondValue ?? '—')) : '';
            return esc(f.name) + ' [' + esc(f.status) + ', ' + f.changedBytes + ' B' + values + ']';
          }).join(' · ') + '</div>' : '') +
          '</div></div>';
      }).join('') +
      '</div>' : '<p class="muted">' + (q ? 'No changed objects match the search.' : 'No changed objects detected.') + '</p>') +
    '<p class="muted">' + esc(c.note || '') + '</p></div>';
}

function bindCorrelationSearch() {
  const input = document.querySelector('#correlationSearch');
  if (!input) return;
  input.oninput = () => {
    correlationSearch = input.value;
    const hadFocus = document.activeElement === input;
    const pos = input.selectionStart;
    render().then(() => {
      if (hadFocus) {
        const next = document.querySelector('#correlationSearch');
        if (next) {
          next.focus();
          if (pos !== null) next.setSelectionRange(pos, pos);
        }
      }
    }).catch(err => {
      console.error('Correlation search render failed', err);
    });
  };
}

function renderRawDiff(d) {
  if (d.exportError) return '<div class="card" style="margin-top:14px"><h3>Decoded PARC Diff · D1.5</h3><p class="muted">' + esc(d.exportError) + '</p></div>';
  const chunks = d.changedChunks || [];
  return '<div class="card" style="margin-top:14px"><h3>Decoded PARC Diff · D1.5</h3>' +
    '<div class="kv">' +
    '<div>Mode</div><span>' + esc(d.mode) + '</span>' +
    '<div>Raw Changed</div><span>' + (d.changed ? 'YES' : 'NO') + '</span>' +
    '<div>Changed Bytes</div><span>' + d.changedBytes + '</span>' +
    '<div>Changed Chunks</div><span>' + d.changedChunkCount + '</span>' +
    '<div>Raw Size Delta</div><span>' + d.rawSizeDelta + ' bytes</span>' +
    '<div>Schema Same</div><span>' + (d.schemaSame ? 'YES' : 'NO') + '</span>' +
    '<div>TOC Count Delta</div><span>' + d.tocCountDelta + '</span>' +
    '<div>First Changed Offset</div><span>' + (d.firstChangedOffset === null ? 'NONE' : '0x' + d.firstChangedOffset.toString(16)) + '</span>' +
    '<div>Last Changed Offset</div><span>' + (d.lastChangedOffset === null ? 'NONE' : '0x' + d.lastChangedOffset.toString(16)) + '</span>' +
    '</div><p class="muted">Returned regions: ' + d.changedChunksReturned + (d.changedChunksTruncated ? ' (truncated)' : '') + '</p>' +
    (chunks.length ? '<div class="list">' + chunks.slice(0,200).map(x => '<div class="item"><code>0x' + x.offset.toString(16).padStart(8,'0') + '</code><span>length=' + x.length + (x.sizeChanged ? ' · size change' : '') + '</span></div>').join('') + '</div>' : '<p class="muted">No raw byte differences found.</p>') +
    '</div>' + renderObjectCorrelation(d.objectCorrelation);
}

function renderDiff(d) {
  const chunks = d.changedChunks || [];
  return '<div class="card" style="margin-top:14px">' +
    '<h3>Save Baseline Diff · D1.4</h3>' +
    '<div class="kv">' +
    '<div>Mode</div><span>' + esc(d.mode) + '</span>' +
    '<div>Files Changed</div><span>' + (d.changed ? 'YES' : 'NO') + '</span>' +
    '<div>Changed Bytes</div><span>' + d.changedBytes + '</span>' +
    '<div>Changed Chunks</div><span>' + d.changedChunkCount + '</span>' +
    '<div>First Changed Offset</div><span>' + (d.firstChangedOffset === null ? 'NONE' : '0x' + d.firstChangedOffset.toString(16)) + '</span>' +
    '<div>Last Changed Offset</div><span>' + (d.lastChangedOffset === null ? 'NONE' : '0x' + d.lastChangedOffset.toString(16)) + '</span></div>' +
    '<h4>Changed regions</h4>' +
    (chunks.length ? '<div class="list">' + chunks.map(x => '<div class="item"><code>0x' + x.offset.toString(16).padStart(8,'0') + '</code><span>length=' + x.length + (x.sizeChanged ? ' · size change' : '') + '</span></div>').join('') + '</div>' : '<p class="muted">No byte differences found.</p>') +
    '<p class="muted">' + esc(d.note) + '</p></div>';
}
function renderAnalysis(a) {
  const pairs = (a.format?.candidatePointerLengthPairs || []).slice(0, 20);
  const interesting = a.strings?.interesting || [];
  return `
    <div class="card" style="margin-top:14px">
      <h3>Binary Structure Analyzer · D1.3</h3>
      <div class="kv">
        <div>Mode</div><span>READ-ONLY STRUCTURAL</span>
        <div>Header</div><code>${esc(a.format.headerAscii)}</code>
        <div>SHA-256</div><code class="hash">${esc(a.sha256)}</code>
        <div>Printable Strings</div><span>${a.strings.printableStringCount}</span>
        <div>Saved Game Version</div><span>${esc(a.known.savedGameVersion || 'NOT RESOLVED')}</span>
        <div>SHA-256 Integrity</div><span>PASS</span>
        <div>HMAC</div><span>NOT RECALCULATED</span>
      </div>
      <h4>Interesting markers</h4>
      ${interesting.length ? interesting.map(x => `<div class="item"><code>0x${x.offset.toString(16).padStart(8,'0')}</code><span>${esc(x.value)}</span></div>`).join('') : '<p class="muted">No known markers found.</p>'}
      <h4>Candidate pointer / length pairs</h4>
      ${pairs.length ? `<div class="list">${pairs.map(x => `<div class="item"><code>0x${x.offset.toString(16).padStart(8,'0')}</code><span>dataOffset=${x.dataOffset} · length=${x.length}</span></div>`).join('')}</div>` : '<p class="muted">No candidates found.</p>'}
      <p class="muted">${esc(a.analyzer.note)}</p>
    </div>`;
}

function renderBaseline(file) {
  return `
    <h3>Save Baseline</h3>
    <div class="kv">
      <div>Filename</div><strong>${esc(file.name)}</strong>
      <div>Full Path</div><code>${esc(file.path)}</code>
      <div>File Size</div><span>${fmtBytes(file.size)}</span>
      <div>Last Modified</div><span>${esc(file.lastModified)}</span>
      <div>SHA-256</div><code class="hash">${esc(file.sha256)}</code>
      <div>Read-only</div><span>YES</span>
      <div>Analysis Status</div><span>${esc(file.status)}</span>
    </div>`;
}

boot();
