# 从 0 到 1：每天 10:00 自动收到 AI 人物日报（小白版）

下面只做“你能直接照抄执行”的步骤。

## 你要准备的账号

1. GitHub（已有仓库）
2. Apify（你已有 API token）
3. OpenAI API key
4. 一个可发信的 SMTP 邮箱（QQ 企业邮 / Gmail / Resend SMTP 等）

---

## 第 1 步：本地先跑通一次

在项目目录执行：

```bash
npm install
cp .env.example .env
```

然后打开 `.env`，先填这些：

- `APIFY_TOKEN=你的 apify token`
- `OPENAI_API_KEY=你的 openai key`
- `OPENAI_MODEL=gpt-4.1-mini`（先用默认）
- `SMTP_HOST=你的 SMTP 域名`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=你的邮箱账号`
- `SMTP_PASS=你的 SMTP 授权码`
- `EMAIL_FROM=发件邮箱`
- `EMAIL_TO=收件邮箱`

---

## 第 2 步：找出 X 和微博的 actor ID

执行：

```bash
npm run list:actors
```

你会看到一张 actor 列表。找到：

- 一个抓 X（Twitter/X）的 actor
- 一个抓微博的 actor

把它们的 id 填到 `.env`：

- `APIFY_X_ACTOR_ID=xxx`
- `APIFY_WEIBO_ACTOR_ID=yyy`

> 不确定哪个是对的？先随便选看起来最像的，跑一次不对再换。我们后续可以再精确对齐。

---

## 第 3 步：执行一次日报任务

执行：

```bash
npm start
```

成功标准：

1. 终端看到 `Daily briefing sent successfully`
2. 你的 `EMAIL_TO` 收到日报邮件

如果失败：

- 报 SMTP 错误：先检查 `SMTP_HOST/PORT/SECURE/USER/PASS`
- 报 actor 错误：检查 `APIFY_X_ACTOR_ID` / `APIFY_WEIBO_ACTOR_ID`
- 报 OpenAI 错误：检查 `OPENAI_API_KEY`

---

## 第 4 步：放到 GitHub，每天自动跑

把代码推到 GitHub 后：

1. 进入仓库 `Settings -> Secrets and variables -> Actions`
2. 把 `.env` 里的每个变量都加成 `Repository secrets`
3. 进入 `Actions` 页面，找到 `Daily AI Briefing`
4. 点 `Run workflow` 手动执行一次
5. 看日志成功后，就会每天自动执行

当前定时是：

- `0 2 * * *`（UTC）= 北京时间每天 `10:00`

---

## 第 5 步（非常重要）：把抓取入参改成你实际 actor 的 schema

现在代码里的抓取入参是“通用占位字段”，不是你 actor 的精确字段。

你要做的是把两个 actor 的 Input JSON（在 Apify actor 页面可复制）发给我，我会直接帮你改成生产可用版本。

你只需要给我：

1. X actor 的 input JSON
2. 微博 actor 的 input JSON

我会帮你完成：

- 精确字段映射
- 数据去重
- 异常兜底

