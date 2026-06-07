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

If you are inside a tmux session, `ducc-trace` automatically opens the monitor panel in a right-side pane (25% width) when launching a command, and closes it when the command exits.

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

**Standalone fullscreen monitor** (also the fallback when not in tmux):

```bash
ducc-trace --monitor
```

Panel keybindings: `j/k` or arrows to navigate, `Enter` to focus the agent's tmux pane, `r` to refresh, `q` to quit.

### What the panel shows

- Progress bar — done / total agents
- Per-agent status: `● running`, `✓ done`, `✗ interrupted`
- Worker count when multiple sub-processes share a session (e.g. `×3`)
- Working directory, token usage, API call count
- Last user input sent to the model
- Tool history — last 8 tool calls with file/command and elapsed time, using icons:
  - `$` Bash / exec  `✎` Write / Edit  `≡` Read  `🔍` Search  `⚡` Web  `◈` Agent

Each running agent writes its live status to `~/.ducc-trace/<session>-<pid>.status.json`, which the panel reads every 500 ms. Stale files (process exited > 5 min ago) are cleaned up automatically.

## Multi-agent monitoring (team / omc-team)

When running `claude --team` or `omc-team`, each sub-agent process inherits the interceptor automatically via `NODE_OPTIONS`. Every process gets its own status file named `<session>-<pid>.status.json`. The panel groups processes by session and shows them as a single entry with a worker count badge, while the detail pane shows the most active worker's state.

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

For streaming responses (`text/event-stream`), the interceptor parses SSE events in real time to extract tool calls and token usage as they arrive, so the monitor panel updates live during a response.

Authorization headers (`Authorization`, `x-api-key`) are automatically redacted in logs.

## Help

```bash
ducc-trace --help
```
