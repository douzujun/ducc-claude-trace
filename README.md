# ducc-trace

Real-time terminal monitor and traffic logger for [Ducc](https://github.com/douzujun/ducc-claude-trace), Claude Code, and any Node.js AI agent.

**[中文文档](./README.zh.md)**

---

## Features

- **Real-time monitor panel** — TUI dashboard showing all running agents, tool history, token usage, and current user input, updated every 500 ms
- **Two data sources** — hooks-based (for native binaries like `claude` / `ducc`) and interceptor-based (for Node.js processes)
- **Multi-agent tracking** — monitors multiple concurrent sessions across different terminal windows from a single panel
- **SSE streaming** — tool calls appear in the panel as soon as they are issued, not after the full response
- **HTML reports** — turn any `.jsonl` log into a browsable report with expandable request/response bodies
- **Team / omc-team aware** — each sub-agent in a parallel team run is grouped under one session entry with a worker count badge

---

## Installation

```bash
npm install -g ducc-trace
```

Requires Node.js >= 18.

---

## Two Monitoring Modes

### Mode 1 — Hooks (recommended for `claude` and `ducc`)

`claude` and `ducc` are native binaries (Bun / Go). `NODE_OPTIONS` injection does not work for them. Instead, `ducc-trace` registers Claude Code hooks that fire on every tool call.

**Setup (one-time):**

```bash
ducc-trace --install-hooks
```

This copies `ducc-trace-hook.js` to `~/.claude/hooks/` and registers `PreToolUse` + `SessionEnd` hooks in `~/.claude/settings.json`. Restart `claude` or `ducc` for the hooks to take effect.

**Then open the monitor in any terminal window:**

```bash
ducc-trace --monitor
```

Every `claude` / `ducc` session anywhere on your machine now streams tool calls into the monitor automatically.

**To remove hooks:**

```bash
ducc-trace --uninstall-hooks
```

### Mode 2 — Interceptor (for Node.js CLIs)

Prefix any Node.js command to inject the interceptor via `NODE_OPTIONS`:

```bash
ducc-trace node my-agent.js
ducc-trace npx my-cli
```

Logs are written to `.ducc-trace/` in the current directory as `.jsonl` files. If you are inside a tmux session, the monitor panel opens automatically in a right-side pane (25% width) and closes when the command exits.

**Custom log directory:**

```bash
DUCC_TRACE_DIR=/tmp/logs ducc-trace node my-agent.js
```

---

## Terminal Monitor Panel

### Open the panel

| Command | Behavior |
|---------|----------|
| `ducc-trace --monitor` | Standalone fullscreen monitor (works anywhere) |
| `ducc-trace --panel` | Split right pane in tmux (30% width); falls back to fullscreen if not in tmux |

### What the panel shows

```
 ducc monitor
────────────────────────────────────────
 ████████████████░░░░░░░░░░ 2/3
 ● 1 running  ✓ 1 done  ✗ 1 interrupted
────────────────────────────────────────
 ● my-project                        3s
 ✓ other-project                    12m
────────────────────────────────────────
 /Users/you/my-project
 running  2s ago
 tokens 14.2k  calls 8
────────────────────────────────────────
 > fix the auth middleware
────────────────────────────────────────
 $ Bash     ls -la src/               1s
 ≡ Read     src/auth/middleware.js    4s
 ✎ Edit     src/auth/middleware.js    6s
 ≡ Read     src/auth/index.js        10s
────────────────────────────────────────
 j/k:nav  Enter:focus  q:quit
```

**Tool icons:**

| Icon | Tool |
|------|------|
| `$` | Bash / exec |
| `✎` | Write / Edit |
| `≡` | Read |
| `🔍` | Search / Grep |
| `⚡` | Web fetch |
| `◈` | Agent |

**Keybindings:** `j` / `k` or arrow keys to navigate, `Enter` to focus the agent's tmux pane, `q` to quit.

---

## Multi-agent Monitoring

### With `claude --team` or `omc-team`

When using `oh-my-claudecode`'s team feature (`/team` or `omc-team`), each spawned sub-agent runs as a separate process. Both monitoring modes handle this automatically:

- **Hooks mode** — each sub-agent session has its own `session_id`, tracked independently. The panel shows each active agent as a separate entry.
- **Interceptor mode** — sub-processes inherit `NODE_OPTIONS`, so every worker writes its own status file. The panel **groups** all workers sharing a session prefix into one entry with a `×N` badge (e.g. `×3` for three parallel workers).

**Recommended setup for team workflows:**

```bash
# 1. Install hooks once
ducc-trace --install-hooks

# 2. Open monitor in one terminal window
ducc-trace --monitor

# 3. Start your team session in another window — no wrapping needed
ducc /omc-team "refactor the entire auth module"
```

The monitor panel will show each agent as it starts, display the tool it is currently running, and mark it done when it exits.

### Watching multiple independent sessions

Because status files are written to `~/.ducc-trace/` (a global directory), a single `ducc-trace --monitor` window shows **all** sessions across all terminal windows simultaneously — no extra configuration needed.

---

## Generate HTML Reports

Turn a `.jsonl` log file into a readable HTML report:

```bash
# Single file
ducc-trace --report .ducc-trace/log-2026-06-07-04-00-00.jsonl

# All logs in .ducc-trace/
ducc-trace --report-all
```

The report shows each API request with method, URL, status code, timestamps, and expandable message content including tool calls, tool results, and thinking blocks.

---

## How It Works

### Hooks mode (native binaries)

```
claude / ducc runs a tool
        ↓
PreToolUse hook fires
        ↓
env -u NODE_OPTIONS node ~/.claude/hooks/ducc-trace-hook.js
        ↓
Reads stdin JSON: { session_id, tool_name, tool_input, cwd }
        ↓
Writes ~/.ducc-trace/<session_id>.status.json
        ↓
panel.js polls every 500 ms → live display
```

### Interceptor mode (Node.js processes)

```
ducc-trace node my-agent.js
        ↓
Sets NODE_OPTIONS=--require interceptor.js
        ↓
interceptor.js hooks globalThis.fetch + http/https
        ↓
Parses SSE stream in real time → extracts tool_use blocks
        ↓
Writes ~/.ducc-trace/<session>-<pid>.status.json
        ↓
panel.js polls every 500 ms → live display
```

Authorization headers (`Authorization`, `x-api-key`) are automatically redacted in all logs.

---

## Command Reference

```
ducc-trace <command> [args...]    wrap a Node.js command with interceptor
ducc-trace --install-hooks        register hooks into ~/.claude/settings.json
ducc-trace --uninstall-hooks      remove hooks from ~/.claude/settings.json
ducc-trace --monitor              standalone fullscreen monitor
ducc-trace --panel                split right pane in tmux (30%), else fullscreen
ducc-trace --report <file.jsonl>  generate HTML report for one log file
ducc-trace --report-all           generate HTML reports for all logs in .ducc-trace/
ducc-trace --help                 show usage
```

---

## Status Files

Both modes write to `~/.ducc-trace/`:

| Mode | Filename | Alive detection |
|------|----------|----------------|
| Hooks | `<session_uuid>.status.json` | `status` field + 30s freshness |
| Interceptor | `<session>-<pid>.status.json` | `pidAlive(pid)` |

Files from sessions that ended more than 5 minutes ago are cleaned up automatically by the panel.
