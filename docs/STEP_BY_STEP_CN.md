# 手把手教程（GitHub + Vercel 全流程，零基础版）

这份文档默认你是第一次做部署。
目标：**每天早上 10:00 自动收到 AI 日报邮件**。

---

## A. 你会在 3 个页面操作

1. **GitHub 仓库页面**（放代码、看 Actions 日志）
2. **Vercel 项目页面**（配置环境变量、自动定时）
3. **邮箱后台**（拿 SMTP 授权码）

---

## B. 一次性准备（10 分钟）

### B1) 确认你有这些账号

- GitHub 账号
- Vercel 账号（并且已绑定 GitHub）
- Apify 账号（有 API token）
- OpenAI API key
- 可发信邮箱（QQ邮箱/企业邮箱/Gmail等）

### B2) 确认仓库里有这些文件

在 GitHub 仓库根目录看到以下文件即可：

- `api/daily-report.js`
- `src/runDailyBriefing.js`
- `vercel.json`
- `.env.example`

---

## C. GitHub 侧：把代码放好

> 如果你的代码已经在 GitHub，直接跳到 D。

### C1) 本地提交并推送

在项目目录执行：

```bash
git add .
git commit -m "deploy: prepare vercel daily briefing"
git push
```

### C2) 在 GitHub 确认

打开仓库页面，确认你能看到刚提交的文件变化。

---

## D. Vercel 侧：创建项目并连接 GitHub

### D1) 创建/导入项目

1. 打开 https://vercel.com
2. 登录后点击 `Add New...` -> `Project`
3. 在 `Import Git Repository` 找到你的仓库
4. 点击 `Import`

### D2) Build 设置（默认即可）

通常无需改动：

- Framework Preset：Other
- Build Command：留空
- Output Directory：留空

点击 `Deploy`（先部署一次也可以，下一步再补环境变量）。

---

## E. Vercel 侧：配置环境变量（最关键）

### E1) 进入变量页面

1. 打开你的 Vercel 项目
2. 点击上方 `Settings`
3. 左侧点击 `Environment Variables`

### E2) 逐条新增变量

每次点击 `Add New`，填 `Name` + `Value`：

- `APIFY_TOKEN`
- `APIFY_X_ACTOR_ID`（建议填）
- `APIFY_WEIBO_ACTOR_ID`（建议填）
- `OPENAI_API_KEY`
- `OPENAI_MODEL`（建议 `gpt-4.1-mini`）
- `SMTP_HOST`
- `SMTP_PORT`（常见 465）
- `SMTP_SECURE`（465 通常填 `true`）
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_TO`

> 小贴士：`Name` 必须完全一致（大写、下划线不能错）。

### E3) 保存后触发重新部署

变量改完后：

1. 点击 `Deployments`
2. 找最新部署右侧 `...`
3. 点 `Redeploy`

---

## F. 如何拿到 APIFY_X_ACTOR_ID / APIFY_WEIBO_ACTOR_ID

如果你还不知道 actor ID，推荐在本地查一次：

```bash
npm install
cp .env.example .env
```

在 `.env` 里先只填：

- `APIFY_TOKEN=你的token`

然后执行：

```bash
npm run list:actors
```

从输出中找：

- X/Twitter 抓取 actor 的 id
- Weibo 抓取 actor 的 id

再把这两个 id 填回 Vercel 环境变量。

---

## G. 手动验收（必须做）

### G1) 打开接口

浏览器访问：

- `https://你的-vercel-域名/api/daily-report`

### G2) 成功标准

同时满足 2 点：

1. 页面返回：`{"ok":true,...}`
2. 你的 `EMAIL_TO` 收到日报

### G3) 如果失败看哪里

1. Vercel 项目 -> `Functions` / `Logs`
2. 看报错关键字：
   - `Missing environment variable`：少变量
   - `Apify API error`：actor ID/token/输入不对
   - `OpenAI` 错误：key 或额度
   - `SMTP` 错误：邮箱配置错误

---

## H. 自动每天 10:00 发送（你不用再手动）

仓库已配置 `vercel.json`：

- `0 2 * * *`（UTC）= 北京时间每天 10:00

Vercel 会自动调用：

- `/api/daily-report`

你只要保证环境变量一直有效即可。

---

## I. 推荐你再做一个“报警邮箱”

建议把 `EMAIL_TO` 设成你常看的邮箱，避免漏读。
如果要多人接收，可以改成逗号分隔（取决于SMTP服务是否支持）。

---

## J. 最后一步：把两个 actor 的 input JSON 发我

你现在系统可以跑，但抓取输入还是“通用字段”。

为了让数据更准，请把这两段发我：

1. X actor 的 input JSON
2. Weibo actor 的 input JSON

我会直接替你改成你账号对应的精确 schema。
