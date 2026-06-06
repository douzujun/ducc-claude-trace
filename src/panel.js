#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DIR = path.join(os.homedir(), '.ducc-trace');
const REFRESH = 500;
const MAX_AGE = 24 * 60 * 60 * 1000;

let selected = 0;
let agents = [];

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', inv: '\x1b[7m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const bold = s => `${C.bold}${s}${C.reset}`;
const cyan = s => `${C.cyan}${s}${C.reset}`;
const green = s => `${C.green}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const gray = s => `${C.gray}${s}${C.reset}`;
const inv = s => `${C.inv}${s}${C.reset}`;
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0);
const fmtAge = iso => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
};

function readAgents() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.status.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } })
    .filter(a => a && Date.now() - new Date(a.updatedAt).getTime() < MAX_AGE)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function render() {
  agents = readAgents();
  if (selected >= agents.length) selected = Math.max(0, agents.length - 1);

  const W = process.stdout.columns || 45;
  const H = process.stdout.rows || 24;
  const sep = gray('─'.repeat(W));
  const out = [];

  out.push(bold(cyan(' ducc monitor')));
  out.push(sep);

  const listMax = Math.max(1, Math.floor(H * 0.45) - 2);
  for (let i = 0; i < Math.min(agents.length, listMax); i++) {
    const a = agents[i];
    const dot = a.status === 'running' ? green('●') : gray('○');
    const name = trunc(path.basename(a.cwd || a.session || '?'), W - 10);
    const age = gray(fmtAge(a.updatedAt));
    const line = ` ${dot} ${name} ${age}`;
    out.push(i === selected ? inv((' ' + line).padEnd(W)) : line);
  }
  if (!agents.length) out.push(gray('  no active agents'));
  out.push(sep);

  // Detail pane for selected agent
  const a = agents[selected];
  if (a) {
    out.push(bold(' ' + trunc(a.cwd || a.session || '?', W - 2)));
    out.push(` ${a.status === 'running' ? green('running') : gray('idle')}  ${gray('updated ' + fmtAge(a.updatedAt) + ' ago')}`);
    if (a.tool) out.push(` tool  ${cyan(trunc(a.tool, W - 7))}`);
    if (a.file) out.push(` file  ${yellow(trunc(a.file, W - 7))}`);
    if (a.tokens != null) out.push(` tokens  ${fmtK(a.tokens)}`);
    if (a.calls != null) out.push(` calls  ${a.calls}`);
    if (a.lastMsg) {
      out.push(sep);
      const words = String(a.lastMsg).replace(/\s+/g, ' ').trim();
      const lines = [];
      for (let i = 0; i < words.length; i += W - 2) lines.push(words.slice(i, i + W - 2));
      lines.slice(0, 4).forEach(l => out.push(' ' + gray(l)));
    }
  }

  out.push(sep);
  out.push(gray(` j/k:nav  Enter:focus  q:quit  r:refresh`));

  const isTmuxPane = !!process.env.DUCC_PANEL_MODE;
  if (isTmuxPane) {
    process.stdout.write('\x1b[H\x1b[2J');
    const visH = Math.min(out.length, H);
    for (let i = 0; i < visH; i++) {
      process.stdout.write(`\x1b[${i + 1};1H` + out[i] + '\x1b[K');
    }
    for (let i = visH; i < H; i++) process.stdout.write(`\x1b[${i + 1};1H\x1b[K`);
  } else {
    process.stdout.write('\x1b[2J\x1b[H');
    out.forEach(l => process.stdout.write(l + '\x1b[K\n'));
  }
}

function setupInput() {
  if (!process.stdin.isTTY) return;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', key => {
    if (key === 'q' || key === '\x03') cleanup();
    if (key === 'k' || key === '\x1b[A') { selected = Math.max(0, selected - 1); render(); }
    if (key === 'j' || key === '\x1b[B') { selected = Math.min(agents.length - 1, selected + 1); render(); }
    if (key === 'r') render();
    if (key === '\r' && agents[selected]) focusAgent(agents[selected]);
  });
}

function focusAgent(a) {
  if (!process.env.TMUX) return;
  try {
    const panes = execSync('tmux list-panes -F "#{pane_index} #{pane_pid} #{pane_tty}"').toString().trim().split('\n');
    for (const line of panes) {
      const [idx, pid] = line.split(' ');
      try {
        const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        if (cwd === a.cwd) { execSync(`tmux select-pane -t ${idx}`); return; }
      } catch {}
    }
  } catch {}
}

function cleanup() {
  process.stdout.write('\x1b[?25h\x1b[2J\x1b[H');
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGWINCH', render);

setupInput();
render();
setInterval(render, REFRESH);
