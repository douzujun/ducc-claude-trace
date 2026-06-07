#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DIR = path.join(os.homedir(), '.ducc-trace');
const REFRESH = 500;
const KEEP_AFTER_EXIT = 5 * 60 * 1000;

let selected = 0;
let agents = [];

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', inv: '\x1b[7m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  gray: '\x1b[90m', red: '\x1b[31m',
};
const bold   = s => `${C.bold}${s}${C.reset}`;
const cyan   = s => `${C.cyan}${s}${C.reset}`;
const green  = s => `${C.green}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const gray   = s => `${C.gray}${s}${C.reset}`;
const red    = s => `${C.red}${s}${C.reset}`;
const inv    = s => `${C.inv}${s}${C.reset}`;

const trunc  = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const fmtK   = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0);
const fmtAge = iso => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
};

function pidAlive(pid) {
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

function progressBar(done, total, width) {
  if (total === 0) return gray('─'.repeat(width));
  const filled = Math.round((done / total) * width);
  return green('█'.repeat(filled)) + gray('░'.repeat(width - filled));
}

function toolIcon(name) {
  if (!name) return '·';
  const n = name.toLowerCase();
  if (n.includes('bash') || n.includes('exec')) return '$';
  if (n.includes('write'))  return '✎';
  if (n.includes('edit'))   return '✎';
  if (n.includes('read'))   return '≡';
  if (n.includes('search') || n.includes('grep')) return '🔍';
  if (n.includes('web'))    return '⚡';
  if (n.includes('agent'))  return '◈';
  return '·';
}

// Read all status files and group sub-processes by session prefix
// interceptor files: <ts>-<parentPid>-<pid>.status.json
// hook files:        <session_uuid>.status.json  (source: "hook")
const STALE_HOOK_MS = 30 * 1000; // treat hook session as done if no update in 30s

function readAgents() {
  if (!fs.existsSync(DIR)) return [];
  const now = Date.now();
  const sessions = new Map();

  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.status.json'))) {
    const fp = path.join(DIR, f);
    let a;
    try { a = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }
    a._file = fp;

    if (a.source === 'hook') {
      // hook-based: no pid, use status field + freshness
      const age = now - new Date(a.updatedAt).getTime();
      if (a.status === 'done') {
        if (age > KEEP_AFTER_EXIT) { try { fs.unlinkSync(fp); } catch {}; continue; }
        a.displayStatus = 'done';
      } else {
        a.displayStatus = age < STALE_HOOK_MS ? 'running' : 'done';
      }
      const sessionKey = `hook-${a.session}`;
      if (!sessions.has(sessionKey)) {
        sessions.set(sessionKey, { rep: a, pids: [], allDone: true, anyRunning: false, anyInterrupted: false });
      }
      const s = sessions.get(sessionKey);
      if (a.displayStatus === 'running') { s.anyRunning = true; s.allDone = false; }
    } else {
      // interceptor-based: pid in filename
      const base = f.replace('.status.json', '');
      const lastDash = base.lastIndexOf('-');
      const pid = base.slice(lastDash + 1);
      const sessionKey = base.slice(0, lastDash);

      const alive = pidAlive(pid);
      if (!alive) {
        const age = now - new Date(a.updatedAt).getTime();
        if (age > KEEP_AFTER_EXIT) { try { fs.unlinkSync(fp); } catch {}; continue; }
        a.displayStatus = a.status === 'done' ? 'done' : 'interrupted';
      } else {
        a.displayStatus = 'running';
      }
      a._pid = pid;

      if (!sessions.has(sessionKey)) {
        sessions.set(sessionKey, { rep: a, pids: [pid], allDone: true, anyRunning: false, anyInterrupted: false });
      } else {
        const s = sessions.get(sessionKey);
        s.pids.push(pid);
        if ((a.calls || 0) > (s.rep.calls || 0) || a.userInput) s.rep = a;
      }
      const s = sessions.get(sessionKey);
      if (a.displayStatus === 'running')     { s.anyRunning = true; s.allDone = false; }
      if (a.displayStatus === 'interrupted') { s.anyInterrupted = true; s.allDone = false; }
    }
  }

  // Build final agent list — one entry per session
  return Array.from(sessions.values()).map(s => {
    const a = { ...s.rep };
    a.workerCount = s.pids.length;
    a.displayStatus = s.anyRunning ? 'running' : s.anyInterrupted ? 'interrupted' : 'done';
    return a;
  }).sort((a, b) => {
    if (a.displayStatus === 'running' && b.displayStatus !== 'running') return -1;
    if (b.displayStatus === 'running' && a.displayStatus !== 'running') return 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function render() {
  agents = readAgents();
  if (selected >= agents.length) selected = Math.max(0, agents.length - 1);

  const W = process.stdout.columns || 50;
  const H = process.stdout.rows || 24;
  const sep = gray('─'.repeat(W));
  const lines = [];

  // header
  lines.push(bold(cyan(' ducc monitor')));
  lines.push(sep);

  // progress summary
  const total       = agents.length;
  const running     = agents.filter(a => a.displayStatus === 'running').length;
  const done        = agents.filter(a => a.displayStatus === 'done').length;
  const interrupted = agents.filter(a => a.displayStatus === 'interrupted').length;

  if (total > 0) {
    const barW = Math.max(10, W - 12);
    lines.push(` ${progressBar(done + interrupted, total, barW)} ${done + interrupted}/${total}`);
    const parts = [];
    if (running)     parts.push(green(`● ${running} running`));
    if (done)        parts.push(gray(`✓ ${done} done`));
    if (interrupted) parts.push(red(`✗ ${interrupted} interrupted`));
    lines.push(' ' + parts.join('  '));
    lines.push(sep);
  }

  // agent list
  const listMax = Math.max(1, Math.floor(H * 0.35));
  for (let i = 0; i < Math.min(agents.length, listMax); i++) {
    const a = agents[i];
    const dot = a.displayStatus === 'running' ? green('●') : a.displayStatus === 'interrupted' ? red('✗') : gray('✓');
    const workers = a.workerCount > 1 ? gray(`×${a.workerCount}`) : '';
    const name = trunc(path.basename(a.cwd || a.session || '?'), W - 14);
    const age  = gray(fmtAge(a.updatedAt));
    const line = ` ${dot} ${name} ${workers} ${age}`;
    lines.push(i === selected ? inv(line.padEnd(W)) : line);
  }
  if (!agents.length) lines.push(gray('  no active agents'));
  lines.push(sep);

  // detail pane
  const a = agents[selected];
  if (a) {
    const statusLabel =
      a.displayStatus === 'running'     ? green('running') :
      a.displayStatus === 'interrupted' ? red('interrupted') :
      gray('done');
    lines.push(bold(' ' + trunc(a.cwd || a.session || '?', W - 2)));
    const workerInfo = a.workerCount > 1 ? gray(` (${a.workerCount} workers)`) : '';
    lines.push(` ${statusLabel}${workerInfo}  ${gray(fmtAge(a.updatedAt) + ' ago')}`);
    if (a.tokens != null) lines.push(` tokens ${fmtK(a.tokens)}  calls ${a.calls || 0}`);

    // user input
    if (a.userInput) {
      lines.push(sep);
      lines.push(` ${cyan('>')} ${gray(trunc(a.userInput, W - 4))}`);
    }

    // tool history steps
    if (Array.isArray(a.toolHistory) && a.toolHistory.length) {
      lines.push(sep);
      const maxSteps = Math.min(a.toolHistory.length, Math.max(2, H - lines.length - 3));
      for (let i = 0; i < maxSteps; i++) {
        const step = a.toolHistory[i];
        const icon = toolIcon(step.tool);
        const age  = gray(fmtAge(step.ts));
        const label = cyan(trunc(step.tool || '', 12));
        const file  = step.file ? yellow(' ' + trunc(step.file, W - 20)) : '';
        lines.push(` ${icon} ${label}${file} ${age}`);
      }
    } else if (a.tool) {
      lines.push(` ${toolIcon(a.tool)} ${cyan(a.tool)}${a.file ? yellow(' ' + trunc(a.file, W - 16)) : ''}`);
    }
  }

  lines.push(sep);
  lines.push(gray(' j/k:nav  Enter:focus  q:quit'));

  let out = '';
  for (let i = 0; i < H; i++) {
    out += `\x1b[${i + 1};1H\x1b[K`;
    if (i < lines.length) out += lines[i];
  }
  process.stdout.write(out);
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
    const panes = execSync('tmux list-panes -a -F "#{pane_index} #{pane_pid}"').toString().trim().split('\n');
    for (const line of panes) {
      const [idx, pid] = line.trim().split(/\s+/);
      try {
        const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        if (cwd === a.cwd) { execSync(`tmux select-pane -t ${idx}`); return; }
      } catch {}
    }
  } catch {}
}

function cleanup() {
  process.stdout.write('\x1b[?1049l');
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGWINCH', () => { process.stdout.write('\x1b[2J'); render(); });

process.stdout.write('\x1b[?1049h\x1b[2J');
setupInput();
render();
setInterval(render, REFRESH);
