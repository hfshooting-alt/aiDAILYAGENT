# 手把手教程（GitHub + Vercel 全流程，零基础版）

这份文档默认你是第一次做部署。
目标：**每天早上 10:00 自动收到 AI 日报邮件**。

---

## A. 你会在 3 个页面操作

1. **GitHub 仓库页面**（放代码、看提交）
2. **Vercel 项目页面**（配置环境变量、看日志）
3. **邮箱后台**（拿 SMTP 授权码）

---

## B. 一次性准备

你需要准备：

- GitHub 账号
- Vercel 账号（已绑定 GitHub）
- Apify token
- OpenAI API key
- SMTP 邮箱账号

---

## C. Vercel 配置环境变量

进入：`Settings -> Environment Variables`，新增：

- `APIFY_TOKEN`
- `APIFY_X_ACTOR_ID`（建议）
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_TO`

保存后到 `Deployments` 点击 `Redeploy`。

---

## D. 新的测试方式（已改为“快速返回 + 后台异步”）

### D1) 线上真实模式（推荐）

打开：

- `https://你的域名/api/daily-report`

你会快速得到响应（`202`, `mode: async`），表示任务已进入后台。

### D2) 同步调试模式（只用于排错）

打开：

- `https://你的域名/api/daily-report?sync=true`

这个模式会等任务跑完才返回，可能需要较长时间。

---

## E. 如何判断是否真的发出日报

因为默认是后台异步，是否成功请看：

1. Vercel 项目 -> `Logs`
2. 查找：
   - `Async daily briefing finished successfully.`（成功）
   - `Async daily briefing failed.`（失败）

同时检查 `EMAIL_TO` 邮箱是否收到日报。

---

## F. 自动每天 10:00 发送

`vercel.json` 已配置每天北京时间 10:00 触发。



## G. 把抓取范围牢牢限制在 20 人 + 最近两天（省钱关键）

在 GitHub Actions Secrets（或 Vercel 环境变量）新增：

- `APIFY_LOOKBACK_DAYS=2`
- `APIFY_FETCH_LIMIT=80`
- `PROMPT_X_MAX_ITEMS=20`
- `PROMPT_WEIBO_MAX_ITEMS=20`

如需更细粒度，新增（可选）：

- `APIFY_X_INPUT_JSON`
- `WEIBO_TARGET_UIDS_JSON`（可选，手动覆盖 UID 映射）

示例值（按你的 actor schema 调整）：

`{"maxItems":40,"sort":"latest"}`

然后去 Apify actor 页面确认：

1. Input 只留目标账号（不要泛关键词）
2. 时间范围设最近 2 天
3. maxItems 设 40~80
4. 保存为默认输入

最后再触发一次 workflow，观察日志里的 `xBefore/xAfter` 和 `weiboBefore/weiboAfter`。
