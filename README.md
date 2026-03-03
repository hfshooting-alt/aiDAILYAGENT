# AI Daily Agent

每天自动追踪 20 位 AI/科技人物（X + 微博）动态，并在每天早上 10:00 发送日报邮件。

## 本次升级（对齐你给的 Apify 统一 API）

- 支持直接使用 `APIFY_ACTS_API_URL`（例如你给的 `/v2/acts?token=...`）自动发现可用 actor。
- 仍支持手动指定 `APIFY_X_ACTOR_ID` 与 `APIFY_WEIBO_ACTOR_ID`，优先使用手动值。
- 抓取链路改为 **Apify REST API 直连**（无需 `apify-client` 依赖）：
  1. 触发 actor run
  2. 读取 run 的 dataset
  3. 交给 OpenAI 生成日报
  4. 通过 SMTP 邮件发送

## 已实现能力

- 预置 10 位 X 人物 + 10 位微博人物账号。
- 抓取最近一天的发帖/互动行为（字段需与你实际 actor schema 对齐）。
- 输出结构化中文日报：今日总览、双平台人物动态、趋势风险、明日关注。
- GitHub Actions 每天 10:00（北京时间）自动运行。

## 快速开始

```bash
npm install
cp .env.example .env
npm start
```

### 必填环境变量

- `APIFY_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS`
- `EMAIL_FROM` / `EMAIL_TO`

### Apify 配置（二选一）

1. **推荐（你当前场景）**：
   - 配置 `APIFY_ACTS_API_URL=https://api.apify.com/v2/acts?token=...`
   - 程序会自动从 acts 列表中尝试匹配 X/微博 actor。

2. **生产更稳定**：
   - 直接配置 `APIFY_X_ACTOR_ID` 和 `APIFY_WEIBO_ACTOR_ID`，跳过自动发现。

## GitHub Actions 定时任务

- 文件：`.github/workflows/daily-report.yml`
- cron：`0 2 * * *`（UTC），对应北京时间 10:00

## 你下一步只要给我这两个 JSON

为了把“占位 input”改成你线上可跑版本，你把这两段发我：

- 你的 X actor input 示例 JSON
- 你的微博 actor input 示例 JSON

我会直接把 `src/main.js` 里的 `buildPlatformInput` 改成你的真实 schema，并补上清洗/去重逻辑。
