# 3 步完成（Vercel 版，极简）

你已经有 Vercel，所以只做这 3 步。

## 第 1 步：把代码放到 GitHub

如果仓库已经在 GitHub，跳过。

## 第 2 步：在 Vercel 配环境变量

打开你的 Vercel 项目：

- Settings -> Environment Variables

把以下变量逐个新增：

- APIFY_TOKEN
- APIFY_X_ACTOR_ID（建议）
- APIFY_WEIBO_ACTOR_ID（建议）
- OPENAI_API_KEY
- OPENAI_MODEL
- SMTP_HOST
- SMTP_PORT
- SMTP_SECURE
- SMTP_USER
- SMTP_PASS
- EMAIL_FROM
- EMAIL_TO

## 第 3 步：Deploy + 验证

1. 在 Vercel 点击 Deploy
2. 部署完成后，浏览器打开：
   - `https://你的域名/api/daily-report`
3. 如果返回 `ok: true` 且邮箱收到日报，说明成功

之后 Vercel 会按 `vercel.json` 每天 10:00（北京时间）自动触发。

---

## 如果你还没确定 actor ID

本地执行：

```bash
npm install
cp .env.example .env
npm run list:actors
```

把找到的 ID 填到 Vercel 环境变量里即可。
