# ducc-trace

Intercept and log all HTTP/HTTPS API traffic from any Node.js CLI — built for [Ducc](https://github.com/douzujun) and Claude Code, works with any Node.js process.

## Installation

```bash
npm install -g ducc-trace
```

Requires Node.js >= 18.

## Usage

Prefix any command with `ducc-trace` to start capturing traffic:

```bash
ducc-trace kiro-cli chat
ducc-trace claude
ducc-trace node my-script.js
```

Logs are written to `.ducc-trace/` in the current directory as `.jsonl` files. The log file path is printed to stderr on startup:

```
[ducc-trace] logging to /your/project/.ducc-trace/log-2026-06-07-04-00-00.jsonl
```

### Custom log directory

```bash
DUCC_TRACE_DIR=/tmp/logs ducc-trace claude
```

## Generate HTML Report

Turn a `.jsonl` log into a readable HTML report:

```bash
# Single file
ducc-trace --report .ducc-trace/log-2026-06-07-04-00-00.jsonl

# All logs in .ducc-trace/
ducc-trace --report-all
```

The HTML report shows each request with method, URL, status, timestamps, and expandable message content (including tool calls, tool results, and thinking blocks for Claude API traffic).

## How it works

`ducc-trace` injects `interceptor.js` via `NODE_OPTIONS=--require`, which hooks:

- `globalThis.fetch` — for modern fetch-based clients (Claude SDK, etc.)
- `require('http')` / `require('https')` — for legacy HTTP clients

Authorization headers (`Authorization`, `x-api-key`) are automatically redacted in logs.

## Help

```bash
ducc-trace --help
```
