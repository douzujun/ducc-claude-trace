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
