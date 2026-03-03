# AI Daily Agent

每天自动追踪 20 位 AI/科技人物（X + 微博）动态，并在每天早上 10:00 发送日报邮件。

## 已实现能力

- 预置 10 位 X 人物 + 10 位微博人物账号。  
- 通过 Apify Actor 分别抓取 X、微博最近一天的数据（发帖/互动行为）。
- 用 OpenAI 生成中文可读日报（总览 + 分平台人物动态 + 趋势风险 + 明日关注）。
- 通过 SMTP 发送至指定邮箱。
- 通过 GitHub Actions 定时运行（UTC 02:00，对应北京时间 10:00）。

## 目录说明

- `src/main.js`：主流程（抓取 -> 生成 -> 发信）
- `src/targets.js`：20 个追踪对象
- `src/prompt.js`：日报提示词模板
- `.github/workflows/daily-report.yml`：定时任务
- `.env.example`：本地运行配置示例

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

填写 `.env`：

- `APIFY_TOKEN`
- `APIFY_X_ACTOR_ID`
- `APIFY_WEIBO_ACTOR_ID`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- SMTP 参数与收发件邮箱

3. 本地测试运行

```bash
npm start
```

## 部署建议

### 方案 A（推荐）：GitHub Actions 定时触发

1. 将项目推送到 GitHub。
2. 在仓库 `Settings -> Secrets and variables -> Actions` 中配置 `.env.example` 对应全部 secret。
3. 确认 workflow 已启用。
4. 用 `workflow_dispatch` 手动触发一次验证。

### 方案 B：Vercel Cron + Serverless API

如果你希望都放在 Vercel，也可以把 `main` 流程改为 `/api/daily-report`，并由 `vercel.json` 配置 cron 调度。当前仓库先提供 GitHub Actions 版本，更容易调试与审计日志。

## 关键注意点

1. **Apify Actor 输入结构需要对齐**：
   - 不同 actor 对字段名要求不同，请把 `src/main.js` 中 `input` 参数改成你实际 actor 的 schema。
2. **邮箱发送稳定性**：
   - 推荐使用企业邮箱 SMTP 或 Resend/SendGrid（可改造 `sendEmail`）。
3. **内容去重与质量**：
   - 如需更高质量，可在 `collectDailySignals` 后增加清洗和去重逻辑。
4. **时区**：
   - GitHub Actions cron 使用 UTC，`0 2 * * *` 即北京时间 10:00。

## 你可以让我下一步继续做的事

- 对接你手头具体的 Apify Actor 输入字段（我可直接帮你改好）。
- 增加“周报模式”（每周一发送上周总结）。
- 增加“重要事件告警”（出现特定关键词时即时邮件）。
- 增加 Notion/飞书同步。
