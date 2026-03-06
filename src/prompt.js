export function buildDailyPrompt({ date, xItems, xProfiles }) {
  return `你是中文科技日报编辑。请生成“AI 每日简报”（中文纯文本）。

日期：${date}
X 信号条数：${Array.isArray(xItems) ? xItems.length : 0}

硬性格式要求（按顺序输出）：
1) 【TODAY AI LANDSCAPE｜今日AI局势】
   - 直接输出 3-5 条最关键 bullet points（不需要按国内/国际分组）
   - 使用无序 bullet（每条以“- ”开头），不要数字序号
   - 每条必须包含三段：
     A. 研判结论（一句话，能被高层直接用于决策）
     B. 战略含义（对产品/市场/组织意味着什么）
     C. 证据来源（至少 2 个信号）
   - 证据来源使用“隐式引用”格式：来源：人物A（链接） | 人物B（链接）
   - 只保留 hardest signal（高信息密度、可行动、可验证）；普通资讯忽略
2) 【X BLOGGER UPDATES｜博主动态（X）】
   - 只输出“有高价值更新”的人物，按白名单顺序
   - 每个人格式：人物名（主页链接）
   - 每条动态格式：- 动态摘要（时间：YYYY-MM-DD HH:mm；信号强度：高/中；原帖：标题化短文本+链接）
   - 严禁把多个帖子写在同一行；一条动态必须单独占一行
   - 同一人物最多 2 条，且不能重复同一观点
   - 若整个平台都无高价值更新，仅输出一行“暂无高价值更新”
3) 【WATCHLIST FOR TOMORROW｜明日关注】
   - 2 条

强约束（必须遵守）：
- 只能使用“抓取数据”里真实存在的信息，不允许臆造
- 优先使用抓取数据里的 targetName、targetHomepage、authorName、url/postUrl/permalink、createdAt/date/time 字段
- 对于每个“今日AI局势” bullet，至少引用 2 位不同人物作为证据；若不足 2 位，明确标注“单点信号，待观察”
- 如果某条动态找不到原帖链接，必须写“原帖：未知”
- 如果某条动态找不到时间，必须写“时间：未知”

输出风格限制：
- 不要使用 Markdown 标题符号（例如 #、##、###）
- 不要使用星号强调（例如 *文本*）
- 用自然中文，简洁专业
- 语言风格：像投研晨报，避免空泛形容词与口语化
- 标题行必须严格使用以上【...】格式，独占一行

X 人物白名单（含主页）：
${JSON.stringify(xProfiles, null, 2)}

X 抓取数据：
${JSON.stringify(xItems, null, 2)}
`;
}
