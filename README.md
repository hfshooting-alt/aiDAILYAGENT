# AI Daily Agent

你的目标：每天上午 10:00 自动收到 20 位 AI 人物的日报邮件。

## 最简方案（推荐）：Vercel Cron

你有 Vercel，那就走最短链路：

1. Vercel 每天定时调用 `/api/daily-report`
2. 接口里运行抓取（Apify）+ 总结（OpenAI）+ 发信（SMTP）
3. 你邮箱收日报

仓库已内置：

- `api/daily-report.js`：Vercel Serverless 入口
- `vercel.json`：每天 `10:00`（北京时间）调度（`0 2 * * *` UTC）
- `src/runDailyBriefing.js`：核心业务流程

## 你只要做 3 件事

### 1) 在 Vercel 项目里设置环境变量

把这些变量全部加到 Vercel Project Settings -> Environment Variables：

- `APIFY_TOKEN`
- `APIFY_X_ACTOR_ID`（可选但建议填）
- `APIFY_WEIBO_ACTOR_ID`（可选但建议填）
- `OPENAI_API_KEY`
- `OPENAI_MODEL`（例如 `gpt-4.1-mini`）
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_TO`

### 2) 部署到 Vercel

- 连接 GitHub 仓库到 Vercel
- 点击 Deploy

### 3) 手动触发一次验证

浏览器打开：

- `https://你的域名/api/daily-report`

返回 `{ ok: true }` 且收到邮件就成功。

---

## 本地调试（可选）

```bash
npm install
cp .env.example .env
npm run list:actors
npm start
```

---

## 重要说明

当前 `buildPlatformInput` 仍是通用字段，你提供两个 actor 的 input JSON 后，我可以替换成你专用 schema（这样数据会更准）。
