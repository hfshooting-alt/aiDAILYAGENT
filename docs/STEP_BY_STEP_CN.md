# 电脑小白专用：你要点哪里、在哪里输入命令（超详细）

这份说明默认你几乎不会命令行。你只要照着做就行。

---

## 0. 先说清楚：你要在“哪里”操作？

你会用到 2 个地方：

1. **代码编辑器**（用来打开和修改文件）
   - 推荐：VS Code（免费下载）
2. **终端**（用来输入命令）
   - 可以是 VS Code 里的终端（最简单）

> 简单理解：
> - “打开文件” = 在 VS Code 里双击文件名
> - “执行命令” = 在 VS Code 下方黑色终端里输入

---

## 1. 安装软件（一次性）

如果你还没有，请先安装：

1. **Node.js 20+**（去 nodejs.org 下载 LTS 版）
2. **Git**（去 git-scm.com 下载）
3. **VS Code**（去 code.visualstudio.com 下载）

安装完后，重启电脑一次（避免环境变量没生效）。

---

## 2. 把项目下载到电脑

### 2.1 打开 VS Code

- 双击 VS Code 图标

### 2.2 打开终端

- 顶部菜单点：`Terminal` -> `New Terminal`
- 你会看到底部出现一个终端窗口

### 2.3 在终端输入（复制粘贴）

> 把下面 `你的仓库地址` 换成你 GitHub 仓库的 HTTPS 地址

```bash
git clone 你的仓库地址
cd aiDAILYAGENT
```

做完后，你已经进入项目目录了（很关键）。

---

## 3. 安装依赖 + 创建配置文件

在刚才那个终端继续输入：

```bash
npm install
cp .env.example .env
```

如果你是 Windows 且 `cp` 不可用，改用：

```bash
copy .env.example .env
```

---

## 4. 打开 `.env` 文件（你问的“去哪里打开文件”）

1. VS Code 左侧文件列表里，找到 `.env`（如果没看到，点刷新）
2. 双击 `.env` 打开
3. 把下面内容按你自己的账号填进去：

- `APIFY_TOKEN=你的 apify token`
- `OPENAI_API_KEY=你的 openai key`
- `OPENAI_MODEL=gpt-4.1-mini`
- `SMTP_HOST=你的 SMTP 服务器地址`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=你的邮箱账号`
- `SMTP_PASS=你的邮箱 SMTP 授权码`
- `EMAIL_FROM=发件邮箱`
- `EMAIL_TO=收件邮箱`

4. 按 `Ctrl + S`（Mac 是 `Cmd + S`）保存

---

## 5. 找 X 和微博的 actor ID（在“哪里执行”？就在同一个终端）

在 VS Code 底部终端输入：

```bash
npm run list:actors
```

你会看到很多 actor。

找到：
- 一个 X/Twitter 的 actor
- 一个微博的 actor

记下它们的 `id`，然后回到 `.env` 文件增加两行：

- `APIFY_X_ACTOR_ID=这里填X的id`
- `APIFY_WEIBO_ACTOR_ID=这里填微博的id`

再保存（`Ctrl+S` / `Cmd+S`）。

---

## 6. 运行一次日报任务

在同一个终端输入：

```bash
npm start
```

### 成功标志

- 终端出现：`Daily briefing sent successfully`
- 你的邮箱收到日报

### 常见报错对照

- SMTP 报错：检查 `SMTP_HOST/PORT/SECURE/USER/PASS`
- OpenAI 报错：检查 `OPENAI_API_KEY`
- actor 报错：检查 `APIFY_X_ACTOR_ID/APIFY_WEIBO_ACTOR_ID`

---

## 7. 上 GitHub 自动每天 10:00 发送

### 7.1 先把代码推上去

在终端输入：

```bash
git add .
git commit -m "setup daily agent"
git push
```

### 7.2 去 GitHub 网站设置密钥

1. 打开你的仓库网页
2. 点 `Settings`
3. 左边点 `Secrets and variables` -> `Actions`
4. 点 `New repository secret`
5. 把 `.env` 里的每个变量都加进去（变量名和值要一模一样）

### 7.3 手动跑一次验证

1. 点仓库上方 `Actions`
2. 选 `Daily AI Briefing`
3. 点 `Run workflow`
4. 日志没报错就表示成功

之后系统会每天自动跑。

---

## 8. 你现在只需要发我 2 个东西（我来改到生产可用）

请把下面两段 JSON 发我：

1. 你 X actor 的 input JSON
2. 你微博 actor 的 input JSON

我会直接帮你把字段对齐，避免“跑得通但数据不准”。
