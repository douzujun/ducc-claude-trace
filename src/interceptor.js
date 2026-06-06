// Injected via NODE_OPTIONS=--require, hooks fetch() to capture API traffic
'use strict';

const fs = require('fs');
const path = require('path');

const logDir = path.join(process.env.DUCC_TRACE_DIR || process.cwd(), '.ducc-trace');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

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

    try {
      if (contentType.includes('text/event-stream')) {
        const reader = clone.body.getReader();
        const parts = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(Buffer.from(value).toString('utf8'));
        }
        resBody = parts.join('');
      } else {
        const text = await clone.text();
        resBody = tryJson(text);
      }
    } catch { resBody = null; }

    writeEntry({
      type: 'fetch',
      timestamp: new Date().toISOString(),
      duration: Date.now() - t0,
      url,
      method,
      requestHeaders: reqHeaders,
      requestBody: reqBody ? tryJson(typeof reqBody === 'string' ? reqBody : String(reqBody)) : null,
      status: response.status,
      responseHeaders: redactHeaders(response.headers),
      responseBody: resBody,
    });

    return response;
  };
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
