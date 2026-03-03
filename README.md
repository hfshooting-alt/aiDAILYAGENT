# AI Daily Agent

每天自动追踪 20 位 AI/科技人物（X + 微博）动态，并在每天早上 10:00 发送日报邮件。

## 你这个 Apify 页面里，我会用哪几个 API？

基于你截图中的能力（尤其是 `GET /v2/acts?token=***`），本项目实际使用这 3 个 endpoint：

1. `GET /v2/acts?token=...`
   - 用途：列出你账号里可用的 actors（用于自动发现 X/微博 actor）
2. `POST /v2/acts/{actorId}/runs?token=...&waitForFinish=180`
   - 用途：触发一次抓取任务
3. `GET /v2/datasets/{datasetId}/items?token=...`
   - 用途：读取抓取结果

> 不需要 `POST /v2/acts`（创建 actor），因为我们只是“调用现有 actor”，不是新建 actor。

## 已实现能力

- 预置 10 位 X 人物 + 10 位微博人物账号。
- 抓取最近一天的发帖/互动行为（字段需与你实际 actor schema 对齐）。
- 输出结构化中文日报：今日总览、双平台人物动态、趋势风险、明日关注。
- GitHub Actions 每天 10:00（北京时间）自动运行。

## 快速开始

```bash
npm install
cp .env.example .env
npm run list:actors
npm start
```

## 环境变量

必填：

- `APIFY_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS`
- `EMAIL_FROM` / `EMAIL_TO`

可选（强烈建议生产设置）：

- `APIFY_X_ACTOR_ID`
- `APIFY_WEIBO_ACTOR_ID`

说明：

- 若不配置 actor ID，程序会根据 actor 名称关键词自动匹配。
- 若配置了 actor ID，会优先使用手动值（更稳定，不怕自动匹配误判）。

## 如何确认 actor ID

运行：

```bash
npm run list:actors
```

从输出里找到你的 X scraper / Weibo scraper 的 `id`，填到 `.env`。

## GitHub Actions 定时任务

- 文件：`.github/workflows/daily-report.yml`
- cron：`0 2 * * *`（UTC），对应北京时间 10:00

## 下一步我可以继续帮你

你把这两段发我，我可以直接改成生产可跑：

- 你的 X actor input 示例 JSON
- 你的微博 actor input 示例 JSON

我会把 `src/main.js` 里的 `buildPlatformInput` 精确替换成你的 schema，并加去重/清洗逻辑。

## 看不懂技术细节？按这个小白教程做

请直接看：`docs/STEP_BY_STEP_CN.md`
