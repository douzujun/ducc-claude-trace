# ducc-trace

[Ducc](https://github.com/douzujun/ducc-claude-trace)、Claude Code 及任意 Node.js AI Agent 的实时终端监控与流量日志工具。

**[English Documentation](./README.md)**

---

## 功能特性

- **实时监控面板** — 终端 TUI 看板，展示所有运行中 agent 的工具历史、token 消耗、当前用户输入，每 500ms 刷新
- **双数据源** — hooks 模式（适用于 `claude`/`ducc` 等原生二进制）+ interceptor 模式（适用于 Node.js 进程）
- **多 agent 汇聚** — 单个监控窗口同时展示不同终端窗口中所有运行中的 session
- **SSE 流式实时** — 工具调用在发出的瞬间即出现在面板中，无需等待整个响应结束
- **HTML 报告** — 将任意 `.jsonl` 日志转为可展开请求/响应体的可视化报告
- **Team / omc-team 支持** — 并行团队任务中每个子 agent 独立追踪，并以 worker 数量徽章汇聚展示

---

## 安装

```bash
npm install -g ducc-trace
```

需要 Node.js >= 18。

---

## 两种监控模式

### 模式一 — Hooks（推荐用于 `claude` 和 `ducc`）

`claude` 和 `ducc` 是原生二进制程序（Bun / Go 编译），`NODE_OPTIONS` 注入对它们无效。`ducc-trace` 通过注册 Claude Code hooks，在每次工具调用时自动采集数据。

**一次性配置：**

```bash
ducc-trace --install-hooks
```

此命令将 `ducc-trace-hook.js` 拷贝到 `~/.claude/hooks/`，并在 `~/.claude/settings.json` 中注册 `PreToolUse` 和 `SessionEnd` 两个 hook。**重启 `claude` 或 `ducc` 后生效。**

**然后在任意终端窗口开启监控：**

```bash
ducc-trace --monitor
```

此后机器上所有的 `claude` / `ducc` 会话都会自动将工具调用流入监控面板。

**卸载 hooks：**

```bash
ducc-trace --uninstall-hooks
```

### 模式二 — Interceptor（用于 Node.js CLI）

在任意 Node.js 命令前加 `ducc-trace` 前缀，通过 `NODE_OPTIONS` 注入 interceptor：

```bash
ducc-trace node my-agent.js
ducc-trace npx my-cli
```

日志以 `.jsonl` 格式保存在当前目录的 `.ducc-trace/` 中。在 tmux 会话内运行时，监控面板会自动在右侧分屏（占 25% 宽度），命令退出时自动关闭。

**自定义日志目录：**

```bash
DUCC_TRACE_DIR=/tmp/logs ducc-trace node my-agent.js
```

---

## 终端监控面板

### 开启面板

| 命令 | 行为 |
|------|------|
| `ducc-trace --monitor` | 独立全屏监控（任何环境均可用） |
| `ducc-trace --panel` | tmux 右侧分屏（30% 宽度）；非 tmux 环境自动降级为全屏 |

### 面板展示内容

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
 > 修复 auth 中间件
────────────────────────────────────────
 $ Bash     ls -la src/               1s
 ≡ Read     src/auth/middleware.js    4s
 ✎ Edit     src/auth/middleware.js    6s
 ≡ Read     src/auth/index.js        10s
────────────────────────────────────────
 j/k:nav  Enter:focus  q:quit
```

**工具图标说明：**

| 图标 | 工具 |
|------|------|
| `$` | Bash / exec |
| `✎` | Write / Edit |
| `≡` | Read |
| `🔍` | Search / Grep |
| `⚡` | Web fetch |
| `◈` | Agent |

**快捷键：** `j` / `k` 或方向键切换 agent，`Enter` 跳转到该 agent 所在的 tmux pane，`q` 退出。

---

## 多 Agent 监控

### 搭配 `claude --team` 或 `omc-team` 使用

使用 `oh-my-claudecode` 的 team 功能（`/team` 或 `omc-team` 命令）时，每个子 agent 作为独立进程运行。两种监控模式均可自动处理：

- **Hooks 模式** — 每个子 agent session 有独立的 `session_id`，在面板中单独显示为一条记录。
- **Interceptor 模式** — 子进程继承 `NODE_OPTIONS`，每个 worker 写入独立的状态文件，面板将同一 session 前缀的所有 worker **合并为一条记录**，并显示 `×N` 徽章（如 `×3` 表示三个并行 worker）。

**Team 工作流推荐配置：**

```bash
# 第一步：一次性安装 hooks
ducc-trace --install-hooks

# 第二步：在一个终端窗口开启监控
ducc-trace --monitor

# 第三步：在另一个窗口直接启动 team 任务，无需包裹
ducc /omc-team "重构整个 auth 模块"
```

监控面板将在每个 agent 启动时实时显示它正在执行的工具，结束时自动标记为 done。

### 监控多个独立会话

所有状态文件都写入 `~/.ducc-trace/`（全局目录），因此**单个 `ducc-trace --monitor` 窗口可以同时展示所有终端窗口中的所有 session**，无需额外配置。

典型使用场景：
- 开一个独立终端窗口跑 `ducc-trace --monitor`
- 其他终端窗口正常使用 `claude` 或 `ducc`（安装 hooks 后自动采集）
- 监控窗口实时展示所有窗口的工作状态

---

## 生成 HTML 报告

将 `.jsonl` 日志文件转为可视化 HTML 报告：

```bash
# 单个文件
ducc-trace --report .ducc-trace/log-2026-06-07-04-00-00.jsonl

# 处理 .ducc-trace/ 下所有日志
ducc-trace --report-all
```

报告展示每条 API 请求的方法、URL、状态码、时间戳，以及可展开的消息内容，包括工具调用、工具结果和 thinking 块。

---

## 工作原理

### Hooks 模式（原生二进制）

```
claude / ducc 执行一个工具
        ↓
PreToolUse hook 触发
        ↓
env -u NODE_OPTIONS node ~/.claude/hooks/ducc-trace-hook.js
        ↓
读取 stdin JSON: { session_id, tool_name, tool_input, cwd }
        ↓
写入 ~/.ducc-trace/<session_id>.status.json
        ↓
panel.js 每 500ms 轮询 → 实时展示
```

### Interceptor 模式（Node.js 进程）

```
ducc-trace node my-agent.js
        ↓
设置 NODE_OPTIONS=--require interceptor.js
        ↓
interceptor.js 挂载 globalThis.fetch + http/https
        ↓
实时解析 SSE 流 → 提取 tool_use 块
        ↓
写入 ~/.ducc-trace/<session>-<pid>.status.json
        ↓
panel.js 每 500ms 轮询 → 实时展示
```

`Authorization`、`x-api-key` 等认证头在所有日志中自动脱敏为 `[REDACTED]`。

---

## 命令速查

```
ducc-trace <命令> [参数...]         用 interceptor 包裹 Node.js 命令
ducc-trace --install-hooks         注册 hooks 到 ~/.claude/settings.json
ducc-trace --uninstall-hooks       从 ~/.claude/settings.json 移除 hooks
ducc-trace --monitor               独立全屏监控
ducc-trace --panel                 tmux 右侧分屏监控（非 tmux 则全屏）
ducc-trace --report <file.jsonl>   生成单个日志的 HTML 报告
ducc-trace --report-all            生成 .ducc-trace/ 下所有日志的 HTML 报告
ducc-trace --help                  显示帮助
```

---

## 状态文件说明

两种模式均写入 `~/.ducc-trace/`：

| 模式 | 文件名 | 存活判断方式 |
|------|--------|------------|
| Hooks | `<session_uuid>.status.json` | `status` 字段 + 30s 新鲜度兜底 |
| Interceptor | `<session>-<pid>.status.json` | `pidAlive(pid)` 进程检测 |

进程退出超过 5 分钟的状态文件由面板自动清理。

---

## 状态显示说明

面板为每个会话显示不同的状态：

| 状态 | 图标 | 含义 |
|------|------|------|
| running | `●` | 会话正在处理中 |
| done | `✓` | 会话正常结束（通过 `SessionEnd` hook 或 `done` 状态） |
| interrupted | `✗` | 会话意外终止（窗口关闭、进程被杀或超时） |

### 自动清理规则

- 无实际活动的会话（`tokens=0`、`calls=0`）会被过滤掉（如 MCP 服务器进程）
- 已完成/中断的会话在 5 分钟后自动删除
- Hooks 模式下超过 30 秒无更新的会话会被标记为 `interrupted`
