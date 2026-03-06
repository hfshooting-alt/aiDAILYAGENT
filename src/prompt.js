export function buildDailyPrompt({ date, xItems, xProfiles }) {
  return `你是中文科技日报编辑。请生成“AI 每日简报”（中文纯文本）。

日期：${date}
X 信号条数：${Array.isArray(xItems) ? xItems.length : 0}

硬性格式要求（按顺序输出）：
1) 【TODAY AI LANDSCAPE｜今日AI局势】
   - 必须先输出“[国内]”小节（1-2 条），再输出“[国际]”小节（1-2 条）
   - 每条一句话，先写结论再写原因
   - 严禁把国内和国际混在同一条里
2) 【X BLOGGER UPDATES｜博主动态（X）】
   - 只输出“有高价值更新”的人物，按白名单顺序
   - 每个人格式：人物名（主页链接）
   - 每条动态格式：- 动态摘要（原帖链接：URL；时间：YYYY-MM-DD HH:mm，若缺失则写“未知”）
   - 同一人物最多 2 条，且不能重复同一观点
   - 若整个平台都无高价值更新，仅输出一行“暂无高价值更新”
3) 【WATCHLIST FOR TOMORROW｜明日关注】
   - 2 条

强约束（必须遵守）：
- 只能使用“抓取数据”里真实存在的信息，不允许臆造
- 优先使用抓取数据里的 targetName、targetHomepage、authorName、url/postUrl/permalink、createdAt/date/time 字段
- 如果某条动态找不到原帖链接，必须写“原帖链接：未知”
- 如果某条动态找不到时间，必须写“时间：未知”

输出风格限制：
- 不要使用 Markdown 标题符号（例如 #、##、###）
- 不要使用星号强调（例如 *文本*）
- 用自然中文，简洁专业
- 标题行必须严格使用以上【...】格式，独占一行

X 人物白名单（含主页）：
${JSON.stringify(xProfiles, null, 2)}

X 抓取数据：
${JSON.stringify(xItems, null, 2)}
`;
}
