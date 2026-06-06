'use strict';

const fs = require('fs');
const path = require('path');

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatEntry(entry) {
  const body = entry.requestBody ? JSON.stringify(entry.requestBody, null, 2) : '';
  const res = entry.responseBody ? JSON.stringify(entry.responseBody, null, 2) : '';
  const messages = extractMessages(entry.requestBody);

  return `<details class="entry">
  <summary><span class="method">${escapeHtml(entry.method || '')}</span> <span class="url">${escapeHtml(entry.url || '')}</span> <span class="status ${entry.status >= 400 ? 'err' : ''}">${entry.status || entry.error || ''}</span> <span class="ts">${entry.timestamp || ''}</span></summary>
  ${messages.length ? `<div class="messages">${messages.map(formatMessage).join('')}</div>` : ''}
  <details class="raw"><summary>Raw request</summary><pre>${escapeHtml(body)}</pre></details>
  <details class="raw"><summary>Raw response</summary><pre>${escapeHtml(res)}</pre></details>
</details>`;
}

function extractMessages(body) {
  if (!body || typeof body !== 'object') return [];
  return body.messages || [];
}

function formatMessage(msg) {
  const content = Array.isArray(msg.content)
    ? msg.content.map(c => {
        if (c.type === 'text') return `<p>${escapeHtml(c.text)}</p>`;
        if (c.type === 'tool_use') return `<pre class="tool">tool_use: ${escapeHtml(c.name)}\n${escapeHtml(JSON.stringify(c.input, null, 2))}</pre>`;
        if (c.type === 'tool_result') return `<pre class="tool">tool_result: ${escapeHtml(JSON.stringify(c.content, null, 2))}</pre>`;
        if (c.type === 'thinking') return `<pre class="thinking">${escapeHtml(c.thinking)}</pre>`;
        return `<pre>${escapeHtml(JSON.stringify(c, null, 2))}</pre>`;
      }).join('')
    : `<p>${escapeHtml(String(msg.content))}</p>`;
  return `<div class="msg msg-${escapeHtml(msg.role || 'unknown')}"><div class="role">${escapeHtml(msg.role || '')}</div>${content}</div>`;
}

function generateReport(jsonlFile) {
  const lines = fs.readFileSync(jsonlFile, 'utf8').trim().split('\n').filter(Boolean);
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ducc-trace: ${escapeHtml(path.basename(jsonlFile))}</title>
<style>
body{font-family:monospace;font-size:13px;background:#1a1a1a;color:#e0e0e0;padding:16px;margin:0}
.entry{border:1px solid #333;margin:8px 0;border-radius:4px;overflow:hidden}
summary{padding:8px 12px;cursor:pointer;background:#252525;user-select:none}
summary:hover{background:#2e2e2e}
.method{color:#7ec8e3;font-weight:bold;min-width:50px;display:inline-block}
.url{color:#c8e37e}
.status{color:#7ec8e3;margin-left:8px}.status.err{color:#e37e7e}
.ts{color:#666;margin-left:8px;font-size:11px}
.messages{padding:12px;border-top:1px solid #333}
.msg{margin:8px 0;border-left:3px solid #444;padding-left:10px}
.msg-user .role{color:#7ec8e3}.msg-assistant .role{color:#c8e37e}.msg-system .role{color:#aaa}
.role{font-weight:bold;font-size:11px;margin-bottom:4px;text-transform:uppercase}
pre{background:#111;padding:10px;border-radius:3px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:4px 0;font-size:12px}
.tool{background:#1a1a2e;color:#9bc4e2}
.thinking{background:#1a2e1a;color:#9be29b}
.raw summary{padding:6px 12px;background:#1f1f1f;font-size:11px;color:#888}
</style>
</head>
<body>
<h2 style="color:#c8e37e;margin-bottom:4px">ducc-trace</h2>
<div style="color:#666;margin-bottom:16px">${escapeHtml(jsonlFile)} — ${entries.length} entries</div>
${entries.map(formatEntry).join('\n')}
</body>
</html>`;

  const outFile = jsonlFile.replace(/\.jsonl$/, '.html');
  fs.writeFileSync(outFile, html);
  console.log(`Report: ${outFile}`);
  return outFile;
}

module.exports = { generateReport };
