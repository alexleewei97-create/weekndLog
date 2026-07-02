# 威肯Log

本地运行的日报 / 任务 / 笔记 / 灵感管理系统。单页 HTML 应用 + 极简本地 Node 助手，改动自动写文件并每日快照备份。

## 启动
双击 **威肯Log.cmd**（需已安装 Node.js）。浏览器会自动打开。保持命令行窗口开着即保持服务运行。

应急：直接双击 `app.html` 也能用，但那是"纯文件模式"，数据仅存浏览器、不自动备份，需手动导出。

## 自动云备份
把整个 威肯Log 文件夹放进 OneDrive 文件夹即可。

## 数据
- 实时数据：`weikenlog-data.json`
- 每日快照：`backups/YYYY-MM-DD.json`（默认保留最近 30 份，可在设置里改）

## 使用手册
见 `使用手册.html`（应用内 设置 → 帮助 也可打开）。

## 开发 / 测试
无第三方依赖。运行单元测试：

```bash
node --test test/logic.test.mjs test/server.test.mjs
```
