# 手把手教程（仅 X 版本）

## 1) 你现在只需要配置这些变量

在 GitHub Actions Secrets（或 Vercel Environment Variables）中填写：

- `APIFY_TOKEN`
- `APIFY_X_ACTOR_ID`
- `APIFY_LOOKBACK_DAYS`
- `APIFY_FETCH_LIMIT`
- `APIFY_X_MAX_ITEMS`
- `APIFY_RUN_MAX_WAIT_SECONDS`
- `APIFY_RUN_POLL_SECONDS`
- `APIFY_X_INPUT_JSON`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_TO`
- `PROMPT_X_MAX_ITEMS`

## 2) 你应该删除的微博变量（如果之前配过）

- `APIFY_WEIBO_ACTOR_ID`
- `APIFY_WEIBO_MAX_ITEMS`
- `WEIBO_TARGET_UIDS_JSON`
- `WEIBO_FALLBACK_PER_USER`
- `WEIBO_EXTERNAL_SPIDER_ENABLED`
- `WEIBO_EXTERNAL_SPIDER_CMD`
- `WEIBO_EXTERNAL_SPIDER_OUTPUT`
- `WEIBO_EXTERNAL_SPIDER_TIMEOUT_MS`
- `PROMPT_WEIBO_MAX_ITEMS`

## 3) 手动测试

- 异步：`https://你的域名/api/daily-report`
- 同步排错：`https://你的域名/api/daily-report?sync=true`

## 4) 自动定时

- GitHub Actions / Vercel 均已是 UTC `0 2 * * *`（北京时间 10:00）。
