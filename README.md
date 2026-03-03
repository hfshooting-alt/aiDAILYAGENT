# AI Daily Agent

你的目标：每天上午 10:00 自动收到 20 位 AI 人物的日报邮件。

## 最简逻辑链路（Vercel）

1. Vercel Cron 定时触发 `/api/daily-report`
2. 接口**立即返回 202**（快速返回）
3. 后台异步执行：Apify 抓取 -> OpenAI 总结 -> SMTP 发信
4. 到 Vercel Logs 查看成功/失败

已内置关键文件：

- `api/daily-report.js`：Vercel Serverless 入口（默认异步）
- `src/runDailyBriefing.js`：抓取 + 总结 + 发信主流程
- `vercel.json`：每天 10:00（北京时间）定时

## 如何手动测试

### 推荐（与线上一致）

打开：

- `https://你的域名/api/daily-report`

你会立刻看到 `202` + `mode: async`，表示任务已进入后台。

### 调试模式（同步等待）

打开：

- `https://你的域名/api/daily-report?sync=true`

这个模式会等待任务执行完成，再返回结果（可能较慢）。

## 你现在该做什么

请直接打开这份超详细教程：

- `docs/STEP_BY_STEP_CN.md`

## 本地调试（可选）

```bash
npm install
cp .env.example .env
npm run list:actors
npm start
```

## 关键提醒

当前 `buildPlatformInput` 是通用占位字段。你把 X/微博 actor 的 input JSON 发我后，我可以改成你的专用 schema，数据质量会明显更高。
