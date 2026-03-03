# 逻辑链路（Vercel 优化版）

1. **Vercel Cron** 每天触发 `/api/daily-report`
2. API 调用 `runDailyBriefing()`
3. `runDailyBriefing()`：
   - Apify: 列 actor / 运行 actor / 读 dataset
   - OpenAI: 生成中文日报
   - SMTP: 发送邮件
4. 返回执行结果 JSON，便于日志排查

## 为什么更简单

- 不依赖 GitHub Actions（可选保留）
- 你只维护一套环境变量（Vercel）
- 浏览器可直接访问接口做健康检查
