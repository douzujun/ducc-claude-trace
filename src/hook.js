#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const statusDir = path.join(os.homedir(), '.ducc-trace');
if (!fs.existsSync(statusDir)) fs.mkdirSync(statusDir, { recursive: true });

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let evt;
  try { evt = JSON.parse(raw); } catch { process.exit(0); }

  const { session_id, cwd, hook_event_name, tool_name, tool_input } = evt;
  if (!session_id) process.exit(0);

  const statusFile = path.join(statusDir, `${session_id}.status.json`);

  let current = {};
  try { current = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch {}

  if (hook_event_name === 'PreToolUse') {
    const file = tool_input?.path || tool_input?.file_path || tool_input?.command || null;
    const toolHistory = Array.isArray(current.toolHistory) ? current.toolHistory : [];
    toolHistory.unshift({ tool: tool_name, file: file ? String(file).slice(0, 80) : null, ts: new Date().toISOString() });
    if (toolHistory.length > 8) toolHistory.length = 8;

    const patch = {
      ...current,
      source: 'hook',
      session: session_id,
      cwd: cwd || current.cwd || '',
      status: 'running',
      tool: tool_name,
      file: file ? String(file).slice(0, 80) : null,
      toolHistory,
      updatedAt: new Date().toISOString(),
    };
    if (!patch.startedAt) patch.startedAt = patch.updatedAt;
    try { fs.writeFileSync(statusFile, JSON.stringify(patch)); } catch {}
  }

  if (hook_event_name === 'SessionEnd') {
    const patch = {
      ...current,
      source: 'hook',
      session: session_id,
      cwd: cwd || current.cwd || '',
      status: 'done',
      doneAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try { fs.writeFileSync(statusFile, JSON.stringify(patch)); } catch {}
  }

  process.exit(0);
});
