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
    '  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);',
    '  [DllImport("xinput1_4.dll")] public static extern int XInputGetState(uint dwUserIndex, out XINPUT_STATE state);',
    '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
    '  [StructLayout(LayoutKind.Sequential)] public struct XINPUT_GAMEPAD { public ushort wButtons; public byte bLeftTrigger; public byte bRightTrigger; public short sThumbLX; public short sThumbLY; public short sThumbRX; public short sThumbRY; }',
    '  [StructLayout(LayoutKind.Sequential)] public struct XINPUT_STATE { public uint dwPacketNumber; public XINPUT_GAMEPAD Gamepad; }',
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
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) throw new Error('Invalid window bounds');
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    hwnd: Number(value.hwnd),
    pid: Number(value.pid),
    processName: String(value.processName || ''),
    title: String(value.title || ''),
    path: String(value.path || ''),
    bounds
  };
}

function runPowerShell(command, { execFileFn = execFile, platform = process.platform, timeout = 1500 } = {}, callback) {
  if (platform !== 'win32') return callback(new Error('Windows resolver requires win32'), null);
  execFileFn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
    (error, stdout) => {
      if (error) return callback(error, null);
      const raw = String(stdout || '').trim();
      if (!raw) return callback(null, null);
      try { callback(null, JSON.parse(raw)); }
      catch (parseError) { callback(parseError, null); }
    }
  );
}

function createWindowsForegroundResolver(options = {}) {
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
  return callback => runPowerShell(command, options, (error, value) => {
    if (error || !value) return callback(error, null);
    try { callback(null, parseWindow(value)); } catch (parseError) { callback(parseError, null); }
  });
}

function createWindowsGameWindowResolver({
  processNames = ['CrimsonDesert', 'CrimsonDesert-Win64-Shipping'],
  titleHints = ['crimson desert'],
  pathHints = ['crimson desert'],
  ...options
} = {}) {
  const names = processNames.map(normalizeProcessName).filter(Boolean);
  const nameArray = names.map(name => "'" + name.replace(/'/g, "''") + "'").join(',');
  const titleArray = titleHints.map(value => "'" + String(value).replace(/'/g, "''").toLowerCase() + "'").join(',');
  const pathArray = pathHints.map(value => "'" + String(value).replace(/'/g, "''").toLowerCase() + "'").join(',');
  const command = [
    user32Prelude(),
    '$names=@(' + nameArray + ');',
    '$titleHints=@(' + titleArray + ');',
    '$pathHints=@(' + pathArray + ');',
    '$items=@(',
    'Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {',
    '  $pname=$_.ProcessName.ToLower();',
    '  $title=[string]$_.MainWindowTitle; $titleLower=$title.ToLower();',
    '  $path=""; try { $path=[string]$_.Path } catch {}',
    '  $pathLower=$path.ToLower();',
    '  $nameMatch=$names -contains $pname;',
    '  $titleMatch=$false; foreach($hint in $titleHints){ if($hint -and $titleLower.Contains($hint)){ $titleMatch=$true; break } }',
    '  $pathMatch=$false; foreach($hint in $pathHints){ if($hint -and $pathLower.Contains($hint)){ $pathMatch=$true; break } }',
    '  if(-not ($nameMatch -or $titleMatch -or $pathMatch)){ return }',
    '  $r=New-Object HorizonUser32+RECT;',
    '  if(-not [HorizonUser32]::GetWindowRect($_.MainWindowHandle,[ref]$r)){ return }',
    '  $w=$r.Right-$r.Left; $h=$r.Bottom-$r.Top;',
    '  if($w -le 0 -or $h -le 0){ return }',
    '  [pscustomobject]@{ hwnd=$_.MainWindowHandle.ToInt64(); pid=$_.Id; processName=$_.ProcessName; title=$title; path=$path; left=$r.Left; top=$r.Top; right=$r.Right; bottom=$r.Bottom; area=($w*$h) }',
    ' }',
    ');',
    '$items | Sort-Object area -Descending | Select-Object -First 1 | ConvertTo-Json -Compress'
  ].join(' ');
  return callback => runPowerShell(command, options, (error, value) => {
    if (error || !value) return callback(error, null);
    try { callback(null, parseWindow(value)); } catch (parseError) { callback(parseError, null); }
  });
}

function createWindowsGlobalInputResolver(options = {}) {
  const command = [
    user32Prelude(),
    '$h=[HorizonUser32]::GetForegroundWindow();',
    'if ($h -eq [IntPtr]::Zero) { exit 0 }',
    '$pid=0;',
    '[void][HorizonUser32]::GetWindowThreadProcessId($h,[ref]$pid);',
    '$p=Get-Process -Id $pid -ErrorAction SilentlyContinue;',
    '$pressed=@();',
    'if (([HorizonUser32]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0) { $pressed += "ESC" }',
    'try { for($i=0;$i -lt 4;$i++){ $state=New-Object HorizonUser32+XINPUT_STATE; if([HorizonUser32]::XInputGetState([uint32]$i,[ref]$state) -eq 0){ if(($state.Gamepad.wButtons -band 0x0010) -ne 0){$pressed += "GAMEPAD_MENU"}; if(($state.Gamepad.wButtons -band 0x0020) -ne 0){$pressed += "GAMEPAD_VIEW"} } } } catch {}',
    '$path=""; try { if($p){$path=[string]$p.Path} } catch {}',
    '[pscustomobject]@{ pid=$pid; processName=if($p){$p.ProcessName}else{""}; title=if($p){$p.MainWindowTitle}else{""}; path=$path; pressed=@($pressed | Select-Object -Unique) } | ConvertTo-Json -Compress'
  ].join(' ');
  return callback => runPowerShell(command, options, callback);
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
  constructor({ resolveWindow, screenApi, onDisplay, onPresence = () => {}, ownProcessNames = [], ownPids = [], trackedProcessNames = [], intervalMs = 500, missingSamples = 3 } = {}) {
    if (typeof resolveWindow !== 'function') throw new TypeError('resolveWindow is required');
    if (!screenApi || (typeof screenApi.getDisplayNearestPoint !== 'function' && typeof screenApi.getDisplayMatching !== 'function')) throw new TypeError('screenApi display lookup is required');
    this.resolveWindow = resolveWindow;
    this.screen = screenApi;
    this.onDisplay = onDisplay || (() => {});
    this.onPresence = onPresence;
    this.ownProcessNames = ownProcessNames;
    this.ownPids = ownPids;
    this.trackedProcessNames = trackedProcessNames;
    this.titleHints = ['crimson desert'];
    this.pathHints = ['crimson desert'];
    this.intervalMs = intervalMs;
    this.missingSamples = missingSamples;
    this.timer = null;
    this.lastTarget = null;
    this.running = false;
    this.present = false;
    this.missingCount = 0;
    this.polling = false;
  }

  poll() {
    if (this.polling) return;
    this.polling = true;
    this.resolveWindow((error, windowInfo) => {
      if (error) { this.polling = false; return; }
      const tracked = shouldTrackWindow(windowInfo, { ownProcessNames: this.ownProcessNames, ownPids: this.ownPids, trackedProcessNames: this.trackedProcessNames });
      if (!tracked) {
        this.missingCount += 1;
        if (this.present && this.missingCount >= this.missingSamples) {
          this.present = false;
          this.lastTarget = null;
          this.onPresence(false, null);
        }
        this.polling = false;
        return;
      }
      this.missingCount = 0;
      if (!this.present) {
        this.present = true;
        this.onPresence(true, windowInfo);
      }
      const center = { x: windowInfo.bounds.x + (windowInfo.bounds.width / 2), y: windowInfo.bounds.y + (windowInfo.bounds.height / 2) };
      const display = typeof this.screen.getDisplayNearestPoint === 'function' ? this.screen.getDisplayNearestPoint(center) : this.screen.getDisplayMatching(windowInfo.bounds);
      if (!display) { this.polling = false; return; }
      const key = String(display.id);
      if (this.lastTarget?.displayId === key && this.lastTarget?.window?.bounds?.x === windowInfo.bounds.x && this.lastTarget?.window?.bounds?.y === windowInfo.bounds.y) {
        this.polling = false;
        return;
      }
      this.lastTarget = { displayId: key, display, window: windowInfo };
      this.onDisplay(display, windowInfo);
      this.polling = false;
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
    return { running: this.running, present: this.present, displayId: this.lastTarget?.displayId || null, window: this.lastTarget?.window || null };
  }
}

class GameInputUiDetector {
  constructor({ resolveInput, onInput, trackedProcessNames = ['CrimsonDesert', 'CrimsonDesert-Win64-Shipping'], intervalMs = 100 } = {}) {
    if (typeof resolveInput !== 'function') throw new TypeError('resolveInput is required');
    this.resolveInput = resolveInput;
    this.onInput = onInput || (() => {});
    this.trackedProcessNames = trackedProcessNames;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.running = false;
    this.lastPressed = new Set();
    this.polling = false;
  }

  poll() {
    if (this.polling) return;
    this.polling = true;
    this.resolveInput((error, info) => {
      if (error || !info) { this.polling = false; return; }
      const processTracked = this.trackedProcessNames.some(name => normalizeProcessName(name) === normalizeProcessName(info.processName));
      const titleTracked = this.titleHints.some(hint => String(info.title || '').toLowerCase().includes(hint));
      const pathTracked = this.pathHints.some(hint => String(info.path || '').toLowerCase().includes(hint));
      const tracked = processTracked || titleTracked || pathTracked;
      if (!tracked) {
        this.lastPressed.clear();
        this.polling = false;
        return;
      }
      const pressed = new Set(Array.isArray(info.pressed) ? info.pressed : []);
      for (const input of pressed) if (!this.lastPressed.has(input)) this.onInput(input, info);
      this.lastPressed = pressed;
      this.polling = false;
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

  reset() {
    this.lastPressed.clear();
  }

  getState() {
    return { running: this.running, pressed: [...this.lastPressed] };
  }
}

module.exports = {
  createWindowsForegroundResolver,
  createWindowsGameWindowResolver,
  createWindowsGlobalInputResolver,
  shouldTrackWindow,
  WindowDisplayTracker,
  GameInputUiDetector
};