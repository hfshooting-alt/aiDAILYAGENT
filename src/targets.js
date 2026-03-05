export const X_TARGET_PROFILES = [
  { name: 'Jim Fan', handle: 'jimfan', homepage: 'https://x.com/jimfan' },
  { name: 'Andrej Karpathy', handle: 'karpathy', homepage: 'https://x.com/karpathy' },
  { name: 'Ashok Elluswamy', handle: 'aelluswamy', homepage: 'https://x.com/aelluswamy' },
  { name: 'Yann LeCun', handle: 'ylecun', homepage: 'https://x.com/ylecun' },
  { name: 'Sam Altman', handle: 'sama', homepage: 'https://x.com/sama' },
  { name: 'Harrison Chase', handle: 'hwchase17', homepage: 'https://x.com/hwchase17' },
  { name: 'swyx', handle: 'swyx', homepage: 'https://x.com/swyx' },
  { name: 'Clement Delangue', handle: 'ClementDelangue', homepage: 'https://x.com/ClementDelangue' },
  { name: 'Demis Hassabis', handle: 'demishassabis', homepage: 'https://x.com/demishassabis' },
  { name: 'Ethan Mollick', handle: 'emollick', homepage: 'https://x.com/emollick' }
];

const WEIBO_TARGET_NAMES = [
  '周鸿祎',
  '李开复',
  '宝玉xp',
  '数字生命卡兹克',
  '阑夕',
  '归藏的AI漫游指南',
  '爱可可-爱生活',
  '稚晖君',
  '何小鹏',
  '王小川'
];

export const WEIBO_TARGET_PROFILES = WEIBO_TARGET_NAMES.map((name) => ({
  name,
  homepage: `https://s.weibo.com/user?q=${encodeURIComponent(name)}`
}));

export const X_TARGETS = X_TARGET_PROFILES.map((item) => item.handle);
export const WEIBO_TARGETS = WEIBO_TARGET_PROFILES.map((item) => item.name);
