# AI Daily Agent

你的目标：每天上午 10:00 自动收到 **X（Twitter）博主** 的 AI 日报邮件。

> 当前版本已完全移除微博抓取链路，仅保留 X 数据源。

## 最简逻辑链路（Vercel）

1. Vercel Cron 定时触发 `/api/daily-report`
2. 接口立即返回 `202`
3. 后台执行：Apify(X) 抓取 -> OpenAI 总结 -> SMTP 发信
4. 在 Logs 查看结果

## 手动测试

- 异步模式：`https://你的域名/api/daily-report`
- 同步排错：`https://你的域名/api/daily-report?sync=true`

## 本地调试

```bash
npm install
cp .env.example .env
npm run list:actors
npm start
```

## 必要环境变量

- `APIFY_TOKEN`
- `APIFY_X_ACTOR_ID`（建议固定）
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_TO`

## 成本控制建议

- `APIFY_LOOKBACK_DAYS=1`
- `APIFY_FETCH_LIMIT=80`
- `PROMPT_X_MAX_ITEMS=20`
- `APIFY_X_INPUT_JSON={"maxItems":40,"sort":"latest"}`（按你的 actor schema 调整）

如果你发现日志里出现 `likelyCapped: true`，说明 24h 内抓到的数据已经触顶当前 limit，建议上调：

- `APIFY_X_MAX_ITEMS`
- 或 `APIFY_FETCH_LIMIT`

## 每天 10:00 自动发送

### 方案 A（推荐）：GitHub Actions

workflow 已配置：UTC `0 2 * * *`（北京时间 10:00）。

### 方案 B：Vercel Cron

`vercel.json` 同样为 UTC `0 2 * * *`。

## 重要说明（已删除的变量）

以下微博相关变量已不再使用，请从 Secrets / Env 中删除：

- `APIFY_WEIBO_ACTOR_ID`
- `APIFY_WEIBO_MAX_ITEMS`
- `WEIBO_TARGET_UIDS_JSON`
- `WEIBO_FALLBACK_PER_USER`
- `WEIBO_EXTERNAL_SPIDER_ENABLED`
- `WEIBO_EXTERNAL_SPIDER_CMD`
- `WEIBO_EXTERNAL_SPIDER_OUTPUT`
- `WEIBO_EXTERNAL_SPIDER_TIMEOUT_MS`
- `PROMPT_WEIBO_MAX_ITEMS`
