export function buildDailyPrompt({ date, xItems, weiboItems }) {
  return `你是一个科技情报编辑。请根据以下抓取数据，生成一份“AI 领袖动态日报”（中文）。\n\n日期：${date}\n\n要求：\n1) 按人物分组整理，重点覆盖：发言观点、点赞/转发/评论行为、涉及事件。\n2) 每个人最多 3 条核心信息，不要流水账。\n3) 每条信息必须包含：\n   - 行为（发帖/点赞/转发/评论）\n   - 观点/态度摘要\n   - 背后事件或上下文（如果可判断）\n4) 输出结构：\n   - 今日总览（5-8 条）\n   - X 人物动态（10 人）\n   - 微博人物动态（10 人）\n   - 趋势与风险提示（3-5 条）\n   - 明日重点关注（3 条）\n5) 风格：简洁、专业、可读性高。\n\nX 数据：\n${JSON.stringify(xItems, null, 2)}\n\n微博数据：\n${JSON.stringify(weiboItems, null, 2)}\n`;
}
