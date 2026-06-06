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
       ducc-trace --panel         open monitor panel (right tmux pane)
       ducc-trace --monitor       standalone fullscreen monitor

Examples:
  ducc-trace kiro-cli chat
  ducc-trace claude
  ducc-trace --panel`);
  process.exit(0);
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
  process.exit(0);
}

// --panel: open a right tmux pane showing the monitor
if (args[0] === '--panel') {
  if (!process.env.TMUX) {
    console.error('[ducc-trace] --panel requires tmux. Start a tmux session first.');
    process.exit(1);
  }
  const panelScript = path.join(__dirname, 'panel.js');
  try {
    // Split right pane (30% width), run panel.js there with DUCC_PANEL_MODE=1
    execSync(`tmux split-window -h -p 30 -d "DUCC_PANEL_MODE=1 node ${panelScript}"`);
    console.log('[ducc-trace] monitor panel opened in right pane');
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

const child = spawn(args[0], args.slice(1), { env, stdio: 'inherit', shell: false });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
