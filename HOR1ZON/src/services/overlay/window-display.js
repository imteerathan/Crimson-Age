const { execFile } = require('node:child_process');

function createWindowsForegroundResolver({
  execFileFn = execFile,
  platform = process.platform,
  timeout = 1500
} = {}) {
  const powershellCommand = [
    'Add-Type @\'',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class HorizonUser32 {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
    '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
    '}',
    '@',
    '$h=[HorizonUser32]::GetForegroundWindow();',
    'if ($h -eq [IntPtr]::Zero) { exit 0 }',
    '$r=New-Object HorizonUser32+RECT;',
    'if (-not [HorizonUser32]::GetWindowRect($h,[ref]$r)) { exit 0 }',
    '$pid=0;',
    '[void][HorizonUser32]::GetWindowThreadProcessId($h,[ref]$pid);',
    '$p=Get-Process -Id $pid -ErrorAction SilentlyContinue;',
    '[pscustomobject]@{ hwnd=$h.ToInt64(); pid=$pid; processName=if($p){$p.ProcessName}else{""}; title=if($p){$p.MainWindowTitle}else{""}; left=$r.Left; top=$r.Top; right=$r.Right; bottom=$r.Bottom } | ConvertTo-Json -Compress'
  ].join(' ');

  return (callback) => {
    if (platform !== 'win32') {
      callback(new Error('Windows foreground window resolver requires win32'), null);
      return;
    }
    execFileFn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', powershellCommand],
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) return callback(error, null);
        const raw = String(stdout || '').trim();
        if (!raw) return callback(null, null);
        try {
          const value = JSON.parse(raw);
          const bounds = {
            x: Number(value.left),
            y: Number(value.top),
            width: Number(value.right) - Number(value.left),
            height: Number(value.bottom) - Number(value.top)
          };
          if (![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)) {
            return callback(new Error('Invalid foreground window bounds'), null);
          }
          if (bounds.width <= 0 || bounds.height <= 0) return callback(null, null);
          callback(null, {
            hwnd: Number(value.hwnd),
            pid: Number(value.pid),
            processName: String(value.processName || ''),
            title: String(value.title || ''),
            bounds
          });
        } catch (parseError) {
          callback(parseError, null);
        }
      }
    );
  };
}

function shouldTrackWindow(windowInfo, { ownProcessNames = [], ownPids = [], trackedProcessNames = [] } = {}) {
  if (!windowInfo || !windowInfo.bounds) return false;
  const processName = String(windowInfo.processName || '').toLowerCase();
  const title = String(windowInfo.title || '').toLowerCase();
  if (ownPids.includes(Number(windowInfo.pid))) return false;
  if (ownProcessNames.some(name => processName === String(name).toLowerCase())) return false;
  if (title.includes('horizon overlay')) return false;
  if (trackedProcessNames.length > 0 && !trackedProcessNames.some(name => processName === String(name).toLowerCase())) return false;
  if (windowInfo.bounds.width < 320 || windowInfo.bounds.height < 240) return false;
  return true;
}

class WindowDisplayTracker {
  constructor({ resolveWindow, screenApi, onDisplay, ownProcessNames = [], ownPids = [], trackedProcessNames = [], intervalMs = 750 } = {}) {
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

module.exports = { createWindowsForegroundResolver, shouldTrackWindow, WindowDisplayTracker };
