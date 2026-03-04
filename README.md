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


## OpenAI 限流（TPM）报错时的快速处理

如果出现 `rate_limit_exceeded` / `Request too large ... tokens per min`，可在环境变量里降低输入规模：

- `PROMPT_X_MAX_ITEMS=20`
- `PROMPT_WEIBO_MAX_ITEMS=20`

默认各 35 条；你可以继续降到 10 做验证。


## 防止 Token 浪费（已加严格过滤）

已在代码中增加“仅保留目标 20 人数据”的过滤逻辑：

- 已强制开启目标账号过滤（不可关闭）
- 先按账号身份字段过滤，再进入 OpenAI 总结
- 日志会打印过滤前后数量（`xBefore/xAfter`, `weiboBefore/weiboAfter`）

你可按需调整：

- `APIFY_FETCH_LIMIT=120`（单次从 Apify 拉取上限）
- `PROMPT_X_MAX_ITEMS=20`
- `PROMPT_WEIBO_MAX_ITEMS=20`

如果仍担心成本，可把 `PROMPT_*` 降到 `10`。


## 日报输出格式（已调整）

目前提示词已强制：

- 先输出“国内+国外AI局势”关键要点
- 再输出 X / 微博博主动态
- 每位博主附主页链接
- 避免 `#` 与 `*` 这类 Markdown 符号

## 每天上午 10:00 自动发送（你需要做的事）

方案 A（推荐）：GitHub Actions

1. 到仓库 `Settings -> Secrets and variables -> Actions -> Secrets` 配置全部变量
2. 到 `Actions -> Daily AI Briefing` 确认 workflow 已启用
3. 当前 cron 已是北京时间每天 10:00（UTC `0 2 * * *`）

方案 B：Vercel Cron

- `vercel.json` 已配置同样的 `0 2 * * *`，部署后会自动触发 `/api/daily-report`。
