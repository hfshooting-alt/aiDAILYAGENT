# 落地实施路线图（已接入 Apify 统一 API）

## 第 1 阶段：5 分钟内跑通

1. 把你给的 URL 放入 `.env`：
   - `APIFY_ACTS_API_URL=https://api.apify.com/v2/acts?token=...`
2. 设置其余密钥（OpenAI + SMTP）。
3. 运行 `npm start`。

> 若自动匹配 actor 不准确，直接配置：
> - `APIFY_X_ACTOR_ID`
> - `APIFY_WEIBO_ACTOR_ID`

## 第 2 阶段：对齐真实 actor schema（关键）

当前 `buildPlatformInput` 仍是通用字段名。你把两个 actor 的 input schema 给我后，我会：

1. 精确改字段映射
2. 增加参数校验
3. 增加数据清洗（去重、无效项过滤）

## 第 3 阶段：稳定上线

1. 配置 GitHub Actions Secrets
2. 手动触发 `workflow_dispatch` 验证
3. 打开定时任务（每天 10:00 北京时间）

## 第 4 阶段：质量增强（可选）

1. 人物长期观点追踪（周环比）
2. 热点事件聚类（跨平台合并）
3. 飞书/企业微信同步推送
