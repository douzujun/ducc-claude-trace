#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const interceptor = path.join(__dirname, 'interceptor.js');
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`Usage: ducc-trace <command> [args...]
       ducc-trace --report [log-file.jsonl]
       ducc-trace --report-all

Examples:
  ducc-trace kiro-cli chat
  ducc-trace claude
  ducc-trace node my-script.js
  ducc-trace --report .ducc-trace/log-2026-06-06.jsonl`);
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

const env = {
  ...process.env,
  NODE_OPTIONS: `--require ${interceptor}${process.env.NODE_OPTIONS ? ' ' + process.env.NODE_OPTIONS : ''}`,
};

const child = spawn(args[0], args.slice(1), { env, stdio: 'inherit', shell: false });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
