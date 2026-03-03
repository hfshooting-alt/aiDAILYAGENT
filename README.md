# AI Daily Agent

你的目标：每天上午 10:00 自动收到 20 位 AI 人物的日报邮件。

## 最简逻辑链路（Vercel）

1. Vercel Cron 定时触发 `/api/daily-report`
2. 接口调用 Apify 抓取 X + 微博数据
3. OpenAI 生成中文日报
4. SMTP 发送到你的邮箱

已内置关键文件：

- `api/daily-report.js`：Vercel Serverless 入口
- `src/runDailyBriefing.js`：抓取 + 总结 + 发信主流程
- `vercel.json`：每天 10:00（北京时间）定时

## 你现在该做什么

请直接打开这份超详细教程：

- `docs/STEP_BY_STEP_CN.md`

它包含：

- GitHub 页面怎么点
- Vercel 页面怎么点
- 环境变量怎么填
- 如何手动验证和看日志

## 本地调试（可选）

```bash
npm install
cp .env.example .env
npm run list:actors
npm start
```

## 关键提醒

当前 `buildPlatformInput` 是通用占位字段。你把 X/微博 actor 的 input JSON 发我后，我可以改成你的专用 schema，数据质量会明显更高。
