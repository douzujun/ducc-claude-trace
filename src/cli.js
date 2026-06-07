#!/usr/bin/env node
'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const interceptor = path.join(__dirname, 'interceptor.js');
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`Usage: ducc-trace <command> [args...]
       ducc-trace --report [log-file.jsonl]
       ducc-trace --report-all
       ducc-trace --panel              open monitor panel (right tmux pane)
       ducc-trace --monitor            standalone fullscreen monitor
       ducc-trace --install-hooks      register hooks into ~/.claude/settings.json
       ducc-trace --uninstall-hooks    remove hooks from ~/.claude/settings.json

Examples:
  ducc-trace claude
  ducc-trace --install-hooks
  ducc-trace --monitor`);
  process.exit(0);
}

if (args[0] === '--install-hooks') {
  installHooks();
  process.exit(0);
}

if (args[0] === '--uninstall-hooks') {
  uninstallHooks();
  process.exit(0);
}

function installHooks() {
  const hooksDir = path.join(os.homedir(), '.claude', 'hooks');
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  const hookSrc = path.join(__dirname, 'hook.js');
  const hookDst = path.join(hooksDir, 'ducc-trace-hook.js');
  fs.copyFileSync(hookSrc, hookDst);
  console.log(`[ducc-trace] hook installed: ${hookDst}`);

  const settingsFile = path.join(os.homedir(), '.claude', 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}

  if (!settings.hooks) settings.hooks = {};

  const hookCmd = `env -u NODE_OPTIONS node ${hookDst}`;
  const preEntry = { matcher: '', hooks: [{ type: 'command', command: hookCmd }] };
  const endEntry = { hooks: [{ type: 'command', command: hookCmd }] };

  // PreToolUse
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];
  const alreadyPre = settings.hooks.PreToolUse.some(e => e.hooks?.some(h => h.command === hookCmd));
  if (!alreadyPre) settings.hooks.PreToolUse.push(preEntry);

  // SessionEnd
  if (!Array.isArray(settings.hooks.SessionEnd)) settings.hooks.SessionEnd = [];
  const alreadyEnd = settings.hooks.SessionEnd.some(e => e.hooks?.some(h => h.command === hookCmd));
  if (!alreadyEnd) settings.hooks.SessionEnd.push(endEntry);

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  console.log(`[ducc-trace] hooks registered in ${settingsFile}`);
  console.log('[ducc-trace] restart claude/ducc for hooks to take effect');
}

function uninstallHooks() {
  const hookDst = path.join(os.homedir(), '.claude', 'hooks', 'ducc-trace-hook.js');
  const settingsFile = path.join(os.homedir(), '.claude', 'settings.json');

  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}

  if (settings.hooks) {
    for (const event of ['PreToolUse', 'SessionEnd', 'PostToolUse']) {
      if (Array.isArray(settings.hooks[event])) {
        settings.hooks[event] = settings.hooks[event].filter(
          e => !e.hooks?.some(h => h.command?.includes('ducc-trace-hook.js'))
        );
        if (settings.hooks[event].length === 0) delete settings.hooks[event];
      }
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    console.log(`[ducc-trace] hooks removed from ${settingsFile}`);
  }

  try { fs.unlinkSync(hookDst); console.log(`[ducc-trace] removed ${hookDst}`); } catch {}
}

if (args[0] === '--report') {
  const { generateReport } = require('./report');
  const file = args[1];
  if (!file) { console.error('Specify a .jsonl file'); process.exit(1); }
  generateReport(file);
  process.exit(0);
}

if (args[0] === '--report-all') {
  const { generateReport } = require('./report');
  const dir = path.join(process.cwd(), '.ducc-trace');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => path.join(dir, f));
  files.forEach(f => generateReport(f));
  console.log(`Generated ${files.length} report(s) in ${dir}`);
  process.exit(0);
}

// --monitor: standalone fullscreen monitor
if (args[0] === '--monitor') {
  require('./panel');
  return;
}

// --panel: open a right tmux pane showing the monitor; fallback to fullscreen
if (args[0] === '--panel') {
  if (!process.env.TMUX) {
    require('./panel');
    return;
  }
  const panelScript = path.join(__dirname, 'panel.js');
  try {
    execSync(`tmux split-window -h -p 30 -d "DUCC_PANEL_MODE=1 node ${panelScript}"`);
  } catch (e) {
    console.error('[ducc-trace] failed to open panel:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

const sessionId = `${Date.now()}-${process.pid}`;
const env = {
  ...process.env,
  NODE_OPTIONS: `--require ${interceptor}${process.env.NODE_OPTIONS ? ' ' + process.env.NODE_OPTIONS : ''}`,
  DUCC_SESSION_ID: sessionId,
};

// Auto-open monitor panel in tmux (right pane); skip silently if not in tmux
let panelPid = null;
if (!process.env.DUCC_PANEL_MODE && process.env.TMUX) {
  const panelScript = path.join(__dirname, 'panel.js');
  const panelRunning = (() => { try { return execSync('pgrep -f "node.*panel.js" || true').toString().trim(); } catch { return ''; } })();
  if (!panelRunning) {
    try {
      execSync(`tmux split-window -h -p 25 -d "DUCC_PANEL_MODE=1 node ${panelScript}"`);
      panelPid = execSync('pgrep -f "node.*panel.js" || true').toString().trim();
    } catch {}
  }
}

const child = spawn(args[0], args.slice(1), { env, stdio: 'inherit', shell: false });
child.on('exit', (code, signal) => {
  if (panelPid) try { process.kill(Number(panelPid), 'SIGTERM'); } catch {}
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
