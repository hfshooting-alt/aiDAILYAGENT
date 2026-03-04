export function buildDailyPrompt({ date, xItems, weiboItems, xProfiles, weiboProfiles }) {
  return `你是中文科技日报编辑。请生成“AI 每日简报”（中文纯文本）。

日期：${date}

硬性格式要求（按顺序输出）：
1) 今日 AI 局势（国内 + 国外）
   - 仅输出 6-8 条关键 bullet points
   - 每条一句话，先写结论再写原因
2) 博主动态（X）
   - 仅限以下人物，且每人最多 2 条
   - 每个人格式：人物名（主页链接）+ 两条动态
3) 博主动态（微博）
   - 仅限以下人物，且每人最多 2 条
   - 每个人格式：人物名（主页链接）+ 两条动态
4) 明日关注
   - 3 条

输出风格限制：
- 不要使用 Markdown 标题符号（例如 #、##、###）
- 不要使用星号强调（例如 *文本*）
- 用自然中文，简洁专业
- 若某人物当日无有效动态，写“暂无高价值更新”

X 人物白名单（含主页）：
${JSON.stringify(xProfiles, null, 2)}

微博人物白名单（含主页）：
${JSON.stringify(weiboProfiles, null, 2)}

X 抓取数据：
${JSON.stringify(xItems, null, 2)}

微博抓取数据：
${JSON.stringify(weiboItems, null, 2)}
`;
}
