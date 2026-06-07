// Injected via NODE_OPTIONS=--require, hooks fetch() to capture API traffic
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const logDir = path.join(process.env.DUCC_TRACE_DIR || process.cwd(), '.ducc-trace');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Global status dir shared across all agent instances
const statusDir = path.join(os.homedir(), '.ducc-trace');
if (!fs.existsSync(statusDir)) fs.mkdirSync(statusDir, { recursive: true });
const sessionId = `${process.env.DUCC_SESSION_ID || 'agent'}-${process.pid}`;
const statusFile = path.join(statusDir, `${sessionId}.status.json`);

let _status = {
  session: sessionId,
  cwd: process.cwd(),
  status: 'running',
  tokens: 0,
  calls: 0,
  tool: null,
  file: null,
  lastMsg: null,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function writeStatus(patch) {
  Object.assign(_status, patch, { updatedAt: new Date().toISOString() });
  try { fs.writeFileSync(statusFile, JSON.stringify(_status)); } catch {}
}

writeStatus({});
process.on('exit', () => writeStatus({ status: 'done', doneAt: new Date().toISOString() }));
process.on('SIGINT', () => { writeStatus({ status: 'done', doneAt: new Date().toISOString() }); process.exit(130); });
process.on('SIGTERM', () => { writeStatus({ status: 'done', doneAt: new Date().toISOString() }); process.exit(143); });

const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
const logFile = path.join(logDir, `log-${ts}.jsonl`);
const stream = fs.createWriteStream(logFile, { flags: 'a' });

function writeEntry(entry) {
  stream.write(JSON.stringify(entry) + '\n');
}

function redactHeaders(headers) {
  const result = {};
  if (!headers) return result;
  const h = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
  for (const [k, v] of Object.entries(h)) {
    result[k] = k.toLowerCase() === 'authorization' || k.toLowerCase() === 'x-api-key' ? '[REDACTED]' : v;
  }
  return result;
}

function tryJson(str) {
  try { return JSON.parse(str); } catch { return str; }
}

// Hook global fetch (Node.js 18+)
const _originalFetch = globalThis.fetch;
if (typeof _originalFetch === 'function') {
  globalThis.fetch = async function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    let reqBody = init?.body ?? (input instanceof Request ? undefined : undefined);
    if (reqBody == null && input instanceof Request) {
      try { reqBody = await input.clone().text(); } catch {}
    }

    const reqHeaders = redactHeaders(init?.headers || (input instanceof Request ? input.headers : {}));
    const t0 = Date.now();

    let response;
    try {
      response = await _originalFetch(input, init);
    } catch (err) {
      writeEntry({ type: 'fetch_error', timestamp: new Date().toISOString(), url, method, error: err.message });
      throw err;
    }

    const clone = response.clone();
    const contentType = response.headers.get('content-type') || '';
    let resBody;

    const parsedReq = reqBody ? tryJson(typeof reqBody === 'string' ? reqBody : String(reqBody)) : null;

    // extract userInput from request regardless of response type
    if (parsedReq && url && url.includes('anthropic')) {
      const msgs = Array.isArray(parsedReq.messages) ? parsedReq.messages : [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          const c = msgs[i].content;
          const text = Array.isArray(c)
            ? c.filter(b => b.type === 'text').map(b => b.text).join(' ')
            : String(c || '');
          if (text.trim()) { writeStatus({ userInput: text.trim().slice(0, 300) }); break; }
        }
      }
    }

    try {
      if (contentType.includes('text/event-stream')) {
        const reader = clone.body.getReader();
        const parts = [];
        // SSE state machine for real-time tool tracking
        let currentTool = null;
        let inputBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = Buffer.from(value).toString('utf8');
          parts.push(chunk);

          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = tryJson(line.slice(6));
            if (!data || typeof data !== 'object') continue;

            if (data.type === 'message_start' && data.message?.usage) {
              const u = data.message.usage;
              const t = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0);
              if (t > 0) writeStatus({ tokens: (_status.tokens || 0) + t, calls: (_status.calls || 0) + 1 });
            }
            if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
              currentTool = { name: data.content_block.name };
              inputBuffer = '';
            }
            if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta' && currentTool) {
              inputBuffer += data.delta.partial_json || '';
            }
            if (data.type === 'content_block_stop' && currentTool) {
              const inp = tryJson(inputBuffer) || {};
              const file = inp.path || inp.file_path || inp.command || null;
              const toolHistory = Array.isArray(_status.toolHistory) ? _status.toolHistory : [];
              toolHistory.unshift({ tool: currentTool.name, file: file ? String(file).slice(0, 80) : null, ts: new Date().toISOString() });
              if (toolHistory.length > 8) toolHistory.length = 8;
              writeStatus({ tool: currentTool.name, file: file ? String(file).slice(0, 80) : null, toolHistory });
              currentTool = null;
              inputBuffer = '';
            }
            if (data.type === 'message_delta' && data.usage) {
              const u = data.usage;
              const t = (u.output_tokens || 0);
              if (t > 0) writeStatus({ tokens: (_status.tokens || 0) + t });
            }
          }
        }
        resBody = parts.join('');
      } else {
        const text = await clone.text();
        resBody = tryJson(text);
      }
    } catch { resBody = null; }

    const entry = {
      type: 'fetch',
      timestamp: new Date().toISOString(),
      duration: Date.now() - t0,
      url,
      method,
      requestHeaders: reqHeaders,
      requestBody: parsedReq,
      status: response.status,
      responseHeaders: redactHeaders(response.headers),
      responseBody: resBody,
    };
    writeEntry(entry);
    // for non-SSE responses (and to capture userInput / lastMsg)
    if (!contentType.includes('text/event-stream')) extractStatus(parsedReq, resBody, url);

    return response;
  };
}

function extractStatus(reqBody, resBody, url) {
  if (!url || !url.includes('anthropic')) return;
  const patch = {};

  // token usage
  const usage = resBody?.usage;
  if (usage) {
    const t = (usage.input_tokens || 0) + (usage.output_tokens || 0) + (usage.cache_read_input_tokens || 0);
    if (t > 0) patch.tokens = (_status.tokens || 0) + t;
  }
  patch.calls = (_status.calls || 0) + 1;

  // last user message from request
  const msgs = Array.isArray(reqBody?.messages) ? reqBody.messages : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      const c = msgs[i].content;
      const text = Array.isArray(c)
        ? c.filter(b => b.type === 'text').map(b => b.text).join(' ')
        : String(c || '');
      if (text.trim()) { patch.userInput = text.trim().slice(0, 300); break; }
    }
  }

  // assistant tool calls + last text message
  const content = Array.isArray(resBody?.content) ? resBody.content : [];
  const toolHistory = Array.isArray(_status.toolHistory) ? _status.toolHistory : [];
  for (const block of content) {
    if (block.type === 'text' && block.text) patch.lastMsg = block.text.slice(0, 200);
    if (block.type === 'tool_use') {
      patch.tool = block.name;
      const inp = block.input;
      patch.file = inp?.path || inp?.file_path || inp?.command || null;
      // prepend to history, keep last 8
      toolHistory.unshift({ tool: block.name, file: patch.file || null, ts: new Date().toISOString() });
      if (toolHistory.length > 8) toolHistory.length = 8;
    }
  }
  if (toolHistory.length) patch.toolHistory = toolHistory;

  writeStatus(patch);
}

// Hook http/https for older clients
['http', 'https'].forEach((proto) => {
  try {
    const mod = require(proto);
    const _orig = mod.request.bind(mod);
    mod.request = function hookedRequest(options, callback) {
      const url = typeof options === 'string' ? options : `${proto}://${options.hostname || options.host}${options.path || '/'}`;
      const method = (typeof options === 'object' ? options.method : 'GET') || 'GET';
      const chunks = [];
      const t0 = Date.now();

      const req = _orig(options, (res) => {
        const resChunks = [];
        res.on('data', (c) => resChunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(resChunks).toString('utf8');
          writeEntry({
            type: 'http',
            timestamp: new Date().toISOString(),
            duration: Date.now() - t0,
            url,
            method,
            requestBody: tryJson(Buffer.concat(chunks).toString('utf8')),
            status: res.statusCode,
            responseBody: tryJson(text),
          });
        });
        if (callback) callback(res);
      });

      const _write = req.write.bind(req);
      req.write = function(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return _write(chunk);
      };

      return req;
    };
  } catch {}
});

process.stderr.write(`[ducc-trace] logging to ${logFile}\n`);
