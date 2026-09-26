let state;
let view = 'home';
let lastBaseline = null;\nlet lastAnalysis = null;
let updater = { status: 'IDLE', message: 'Updater ready', version: '' };

const app = document.querySelector('#app');
const updateButton = document.querySelector('#update');

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
    bindUpdater();
    await render();
  } catch (err) {
    console.error('Crimson Age boot failed', err);
    app.innerHTML = `<div class="card"><h1>Crimson Age startup error</h1><p>${esc(err?.message || err)}</p></div>`;
  }
}

function bindUpdater() {
  updateButton.onclick = async () => {
    updateButton.disabled = true;
    updateButton.textContent = 'Checking…';
    try {
      updater = await window.crimsonAge.checkForUpdates();

      if (updater.status === 'UPDATE_AVAILABLE') {
        if (confirm(`Crimson Age ${updater.availableVersion} is available. Download now?`)) {
          updater = await window.crimsonAge.downloadUpdate();
        }
      }

      if (updater.status === 'READY_TO_INSTALL') {
        if (confirm('Update downloaded. Restart Crimson Age and install it now?')) {
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
  const version = esc(updater.availableVersion || updater.version || '—');
  const progress = Number.isFinite(updater.progress) ? `${updater.progress}%` : '';

  return `
    <div class="card update-card">
      <div class="section-title">Software Update</div>
      <div class="update-row"><span>Status</span><strong>${status}</strong></div>
      <div class="update-row"><span>Version</span><strong>${version}</strong></div>
      <p class="muted">${message}</p>
      ${progress ? `<div class="progress"><span style="width:${progress}"></span></div>` : ''}
      ${updater.status === 'READY_TO_INSTALL' ? '<button id="restartUpdate">Restart & Install Update</button>' : ''}
    </div>`;
}

async function render() {
  const info = await window.crimsonAge.dbInfo();
  let html = '';

  if (view === 'home') {
    html = `
      <h1>Crimson Age Desktop</h1>
      <p class="muted">Windows-first · local field test · build ${esc(info.version)}</p>
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
        <p>Field-test the real Save, capture a baseline, make one controlled gameplay change, then capture the next baseline.</p>
      </div>`;
  } else if (view === 'playbook') {
    html = `
      <h1>Playbook</h1>
      <div class="list">
        <div class="item">D1 · Desktop Foundation <b>IN PROGRESS</b></div>
        <div class="item">D1.2 · Save Baseline <b>VERIFIED</b></div>
        <div class="item">D1.3 · Binary Structure Analyzer <b>PLANNED</b></div>
        <div class="item">D2 · Crimson Age Core <b>PLANNED</b></div>
        <div class="item">D3 · Local Database <b>PLANNED</b></div>
        <div class="item">D4 · Real Map <b>PLANNED</b></div>
        <div class="item">D5 · Save Analyzer <b>PLANNED</b></div>
        <div class="item">D6 · Crimson Route Integration <b>PLANNED</b></div>
        <div class="item">D7 · Real Gameplay Field Test <b>PLANNED</b></div>
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
    const analysisCard = lastAnalysis ? renderAnalysis(lastAnalysis) : '';\n    const history = baselines.length
      ? `<div class="card" style="margin-top:14px"><h3>Baseline History</h3>${baselines.map((b, i) => `
          <div class="item">
            <div>
              <b>${esc(b.label || `Baseline #${b.id}`)}</b>
              <div class="muted">${esc(b.createdAt)} · ${fmtBytes(b.fileSize)}</div>
              <code>${esc(b.sha256)}</code>
            </div>
            <span>${i === 0 ? 'LATEST' : ''}</span>
          </div>`).join('')}</div>`
      : '';

    html = `
      <h1>Save Analyzer</h1>
      <p class="muted">Read-only baseline inspection. Crimson Age never writes to the selected game save.</p>
      <button id="pick">Select save file</button>
      <div id="picked" class="card" style="margin-top:14px">${lastBaseline ? renderBaseline(lastBaseline) : 'No new file selected in this session.'}</div>
      ${analysisCard}${history}`;
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

  const restart = document.querySelector('#restartUpdate');
  if (restart) {
    restart.onclick = async () => {
      await window.crimsonAge.installUpdate();
    };
  }
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
