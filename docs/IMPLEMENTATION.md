# 落地实施路线图（按你现有 API）

## 第 1 步：确认两个 actor

1. 配置 `APIFY_TOKEN`
2. 运行：`npm run list:actors`
3. 找到：
   - 一个 X 抓取 actor
   - 一个微博抓取 actor
4. 将它们的 ID 写入：
   - `APIFY_X_ACTOR_ID`
   - `APIFY_WEIBO_ACTOR_ID`

## 第 2 步：跑通日报链路

1. 配置 OpenAI 与 SMTP 环境变量
2. 运行：`npm start`
3. 确认收到日报邮件

## 第 3 步：对齐真实 schema（关键）

当前 `buildPlatformInput` 用的是通用字段名。你给我两个 actor 的 input JSON 后，我会：

1. 精确改字段映射
2. 增加参数校验
3. 增加数据清洗（去重、无效项过滤）

## 第 4 步：上线自动化

1. 配置 GitHub Actions Secrets
2. 手动触发一次 workflow 验证
3. 启用每天 10:00（北京时间）自动发送
