# ducc-trace

拦截并记录任意 Node.js CLI 的 HTTP/HTTPS API 流量，专为 [Ducc](https://github.com/douzujun) 和 Claude Code 打造，也适用于任何 Node.js 进程。

## 安装

```bash
npm install -g ducc-trace
```

需要 Node.js >= 18。

## 使用

在任意命令前加上 `ducc-trace` 即可开始抓包：

```bash
ducc-trace kiro-cli chat
ducc-trace claude
ducc-trace node my-script.js
```

日志以 `.jsonl` 格式保存在当前目录的 `.ducc-trace/` 文件夹中，启动时会在 stderr 打印日志路径：

```
[ducc-trace] logging to /your/project/.ducc-trace/log-2026-06-07-04-00-00.jsonl
```

### 自定义日志目录

```bash
DUCC_TRACE_DIR=/tmp/logs ducc-trace claude
```

## 终端监控面板

无需打开多个窗口，在当前终端右侧实时监控所有运行中的 agent。

**在 tmux 会话中** — 在右侧打开监控面板（占 30% 宽度）：

```bash
ducc-trace --panel
```

**独立全屏监控：**

```bash
ducc-trace --monitor
```

面板快捷键：`j/k` 或方向键切换 agent，`Enter` 聚焦该 agent 所在的 tmux pane，`r` 手动刷新，`q` 退出。

每个运行中的 agent 会将实时状态写入 `~/.ducc-trace/<session>-<pid>.status.json`，面板每 500ms 读取一次，展示以下信息：

- 工作目录
- 当前正在使用的 tool 及操作的文件
- Token 消耗量和 API 调用次数
- 最近一条 assistant 消息摘要

## 多 agent 监控（team / omc-team）

执行 `claude --team` 或 `omc-team` 时，每个子 agent 进程会通过 `NODE_OPTIONS` 自动继承 interceptor。每个进程生成独立的状态文件 `<session>-<pid>.status.json`，面板可同时展示所有子 agent 的工作进度。

## 生成 HTML 报告

将 `.jsonl` 日志转为可视化 HTML 报告：

```bash
# 单文件
ducc-trace --report .ducc-trace/log-2026-06-07-04-00-00.jsonl

# 处理 .ducc-trace/ 下所有日志
ducc-trace --report-all
```

HTML 报告展示每条请求的方法、URL、状态码、时间戳，以及可展开的消息内容（包括 Claude API 的工具调用、工具结果和 thinking 块）。

## 原理

`ducc-trace` 通过 `NODE_OPTIONS=--require` 注入 `interceptor.js`，自动 Hook：

- `globalThis.fetch` — 适用于现代 fetch 客户端（Claude SDK 等）
- `require('http')` / `require('https')` — 适用于传统 HTTP 客户端

`Authorization` 和 `x-api-key` 等认证头在日志中会自动脱敏为 `[REDACTED]`。

## 帮助

```bash
ducc-trace --help
```
