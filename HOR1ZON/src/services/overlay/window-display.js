const { execFile } = require('node:child_process');

function normalizeProcessName(value) {
  return String(value || '').toLowerCase().replace(/\.exe$/, '');
}

function user32Prelude() {
  return [
    "Add-Type @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class HorizonUser32 {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
    '  [DllImport("user32.dll")] public static extern bool GetCursorInfo(ref CURSORINFO info);',
    '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
    '  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }',
    '  [StructLayout(LayoutKind.Sequential)] public struct CURSORINFO { public int cbSize; public int flags; public IntPtr hCursor; public POINT ptScreenPos; }',
    '}',
    '@'
  ].join(' ');
}

function parseWindow(value) {
  const bounds = {
    x: Number(value.left),
    y: Number(value.top),
    width: Number(value.right) - Number(value.left),
    height: Number(value.bottom) - Number(value.top)
  };
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
    throw new Error('Invalid window bounds');
  }
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    hwnd: Number(value.hwnd),
    pid: Number(value.pid),
    processName: String(value.processName || ''),
    title: String(value.title || ''),
    bounds
  };
}

function createWindowsForegroundResolver({
  execFileFn = execFile,
  platform = process.platform,
  timeout = 1500
} = {}) {
  const command = [
    user32Prelude(),
    '$h=[HorizonUser32]::GetForegroundWindow();',
    'if ($h -eq [IntPtr]::Zero) { exit 0 }',
    '$r=New-Object HorizonUser32+RECT;',
    'if (-not [HorizonUser32]::GetWindowRect($h,[ref]$r)) { exit 0 }',
    '$pid=0;',
    '[void][HorizonUser32]::GetWindowThreadProcessId($h,[ref]$pid);',
    '$p=Get-Process -Id $pid -ErrorAction SilentlyContinue;',
    '[pscustomobject]@{ hwnd=$h.ToInt64(); pid=$pid; processName=if($p){$p.ProcessName}else{""}; title=if($p){$p.MainWindowTitle}else{""}; left=$r.Left; top=$r.Top; right=$r.Right; bottom=$r.Bottom } | ConvertTo-Json -Compress'
  ].join(' ');

  return callback => {
    if (platform !== 'win32') return callback(new Error('Windows foreground resolver requires win32'), null);
    execFileFn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) return callback(error, null);
        const raw = String(stdout || '').trim();
        if (!raw) return callback(null, null);
        try { callback(null, parseWindow(JSON.parse(raw))); }
        catch (parseError) { callback(parseError, null); }
      }
    );
  };
}

function createWindowsGameWindowResolver({
  processNames = ['CrimsonDesert', 'CrimsonDesert-Win64-Shipping'],
  execFileFn = execFile,
  platform = process.platform,
  timeout = 1500
} = {}) {
  const names = processNames.map(normalizeProcessName).filter(Boolean);
  const nameArray = names.map(name => "'" + name.replace(/'/g, "''") + "'").join(',');
  const command = [
    user32Prelude(),
    '$names=@(' + nameArray + ');',
    '$items=@(',
    'Get-Process -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.ProcessName.ToLower() } | ForEach-Object {',
    '  if ($_.MainWindowHandle -eq 0) { return }',
    '  $r=New-Object HorizonUser32+RECT;',
    '  if (-not [HorizonUser32]::GetWindowRect($_.MainWindowHandle,[ref]$r)) { return }',
    '  $w=$r.Right-$r.Left; $h=$r.Bottom-$r.Top;',
    '  if ($w -le 0 -or $h -le 0) { return }',
    '  [pscustomobject]@{ hwnd=$_.MainWindowHandle.ToInt64(); pid=$_.Id; processName=$_.ProcessName; title=$_.MainWindowTitle; left=$r.Left; top=$r.Top; right=$r.Right; bottom=$r.Bottom; area=($w*$h) }',
    ' }',
    ');',
    '$items | Sort-Object area -Descending | Select-Object -First 1 | ConvertTo-Json -Compress'
  ].join(' ');

  return callback => {
    if (platform !== 'win32') return callback(new Error('Windows game resolver requires win32'), null);
    execFileFn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) return callback(error, null);
        const raw = String(stdout || '').trim();
        if (!raw) return callback(null, null);
        try { callback(null, parseWindow(JSON.parse(raw))); }
        catch (parseError) { callback(parseError, null); }
      }
    );
  };
}

function createWindowsForegroundUiResolver({
  execFileFn = execFile,
  platform = process.platform,
  timeout = 1500
} = {}) {
  const command = [
    user32Prelude(),
    '$h=[HorizonUser32]::GetForegroundWindow();',
    'if ($h -eq [IntPtr]::Zero) { exit 0 }',
    '$pid=0;',
    '[void][HorizonUser32]::GetWindowThreadProcessId($h,[ref]$pid);',
    '$p=Get-Process -Id $pid -ErrorAction SilentlyContinue;',
    '$ci=New-Object HorizonUser32+CURSORINFO;',
    '$ci.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($ci.GetType());',
    '$cursorVisible=$false;',
    'if([HorizonUser32]::GetCursorInfo([ref]$ci)){ $cursorVisible=(($ci.flags -band 1) -eq 1) };',
    '[pscustomobject]@{ pid=$pid; processName=if($p){$p.ProcessName}else{""}; title=if($p){$p.MainWindowTitle}else{""}; cursorVisible=$cursorVisible } | ConvertTo-Json -Compress'
  ].join(' ');

  return callback => {
    if (platform !== 'win32') return callback(new Error('Windows UI resolver requires win32'), null);
    execFileFn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) return callback(error, null);
        const raw = String(stdout || '').trim();
        if (!raw) return callback(null, null);
        try {
          const value = JSON.parse(raw);
          callback(null, {
            pid: Number(value.pid),
            processName: String(value.processName || ''),
            title: String(value.title || ''),
            cursorVisible: Boolean(value.cursorVisible)
          });
        } catch (parseError) { callback(parseError, null); }
      }
    );
  };
}

function shouldTrackWindow(windowInfo, { ownProcessNames = [], ownPids = [], trackedProcessNames = [] } = {}) {
  if (!windowInfo || !windowInfo.bounds) return false;
  const processName = normalizeProcessName(windowInfo.processName);
  const title = String(windowInfo.title || '').toLowerCase();
  if (ownPids.includes(Number(windowInfo.pid))) return false;
  if (ownProcessNames.some(name => processName === normalizeProcessName(name))) return false;
  if (title.includes('horizon overlay')) return false;
  if (trackedProcessNames.length > 0 && !trackedProcessNames.some(name => processName === normalizeProcessName(name))) return false;
  if (windowInfo.bounds.width < 320 || windowInfo.bounds.height < 240) return false;
  return true;
}

class WindowDisplayTracker {
  constructor({ resolveWindow, screenApi, onDisplay, ownProcessNames = [], ownPids = [], trackedProcessNames = [], intervalMs = 500 } = {}) {
    if (typeof resolveWindow !== 'function') throw new TypeError('resolveWindow is required');
    if (!screenApi || typeof screenApi.getDisplayMatching !== 'function') throw new TypeError('screenApi.getDisplayMatching is required');
    this.resolveWindow = resolveWindow;
    this.screen = screenApi;
    this.onDisplay = onDisplay || (() => {});
    this.ownProcessNames = ownProcessNames;
    this.ownPids = ownPids;
    this.trackedProcessNames = trackedProcessNames;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.lastTarget = null;
    this.running = false;
  }

  poll() {
    this.resolveWindow((error, windowInfo) => {
      if (error || !windowInfo || !shouldTrackWindow(windowInfo, {
        ownProcessNames: this.ownProcessNames,
        ownPids: this.ownPids,
        trackedProcessNames: this.trackedProcessNames
      })) return;
      const display = this.screen.getDisplayMatching(windowInfo.bounds);
      if (!display) return;
      const key = String(display.id);
      if (this.lastTarget?.displayId === key) return;
      this.lastTarget = { displayId: key, display, window: windowInfo };
      this.onDisplay(display, windowInfo);
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getState() {
    return {
      running: this.running,
      displayId: this.lastTarget?.displayId || null,
      window: this.lastTarget?.window || null
    };
  }
}

class GameUiHeuristicDetector {
  constructor({
    resolveUi,
    onState,
    trackedProcessNames = ['CrimsonDesert', 'CrimsonDesert-Win64-Shipping'],
    intervalMs = 250,
    hideSamples = 2,
    restoreSamples = 4
  } = {}) {
    if (typeof resolveUi !== 'function') throw new TypeError('resolveUi is required');
    this.resolveUi = resolveUi;
    this.onState = onState || (() => {});
    this.trackedProcessNames = trackedProcessNames;
    this.intervalMs = intervalMs;
    this.hideSamples = hideSamples;
    this.restoreSamples = restoreSamples;
    this.timer = null;
    this.running = false;
    this.visibleCursorSamples = 0;
    this.hiddenCursorSamples = 0;
    this.state = 'UNKNOWN';
  }

  poll() {
    this.resolveUi((error, info) => {
      if (error || !info) return;
      const tracked = this.trackedProcessNames.some(name => normalizeProcessName(name) === normalizeProcessName(info.processName));
      if (!tracked) {
        this.visibleCursorSamples = 0;
        this.hiddenCursorSamples = 0;
        return;
      }
      if (info.cursorVisible) {
        this.visibleCursorSamples += 1;
        this.hiddenCursorSamples = 0;
        if (this.visibleCursorSamples >= this.hideSamples && this.state !== 'GAME_UI_HEURISTIC') {
          this.state = 'GAME_UI_HEURISTIC';
          this.onState(this.state, info);
        }
      } else {
        this.hiddenCursorSamples += 1;
        this.visibleCursorSamples = 0;
        if (this.hiddenCursorSamples >= this.restoreSamples && this.state !== 'GAMEPLAY') {
          this.state = 'GAMEPLAY';
          this.onState(this.state, info);
        }
      }
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getState() {
    return { running: this.running, state: this.state };
  }
}

module.exports = {
  createWindowsForegroundResolver,
  createWindowsGameWindowResolver,
  createWindowsForegroundUiResolver,
  shouldTrackWindow,
  WindowDisplayTracker,
  GameUiHeuristicDetector
};
