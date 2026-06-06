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

## Terminal Monitor Panel

Watch all running agents in real time without opening extra windows.

**Inside a tmux session** — open a right-side panel (30% width):

```bash
ducc-trace --panel
```

**Standalone fullscreen monitor:**

```bash
ducc-trace --monitor
```

Panel keybindings: `j/k` or arrows to navigate, `Enter` to focus the agent's tmux pane, `r` to refresh, `q` to quit.

Each running agent writes its live status to `~/.ducc-trace/<session>-<pid>.status.json`, which the panel reads every 500 ms. Displayed fields:

- Working directory
- Current tool and file being operated on
- Token usage and API call count
- Last assistant message excerpt

## Multi-agent monitoring (team / omc-team)

When running `claude --team` or `omc-team`, each sub-agent process inherits the interceptor automatically via `NODE_OPTIONS`. Every process gets its own status file named `<session>-<pid>.status.json`, so the panel shows each agent independently.

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
