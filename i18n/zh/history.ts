import type { history as English } from '../en/history';

export const history: typeof English = {
  title: '记录',

  dayToday: (date) => `今天 · ${date}`,
  dayYesterday: (date) => `昨天 · ${date}`,
  dayOther: (weekday, date) => `${date} ${weekday}`,

  toDebt: (amount) => `还预支 ${amount}`,

  notSpending: '不算开销',
  toWalletPart: (amount) => `钱包 ${amount}`,
  fromWallet: '从钱包出',
  walletToGoals: (goal) => `钱包 → ${goal}`,
  goalToWallet: (goal) => `${goal} → 钱包`,
  justMoved: '不算存钱，也不算开销',
  notSaving: '不算存入',

  tradeTitle: (label, counter) => `${label} · ${counter}`,
  fromGoal: (goal) => `从 ${goal} 出`,
  intoGoal: (goal) => `存进 ${goal}`,
  splitAcross: (n) => `分到 ${n} 个钱罐`,
  coveredSpentAhead: (amount) => `补回预支 ${amount}`,
  openTrade: '打开这笔交易',

  deletedGoal: '已删除的钱罐',

  undoOutgoing: (amount) => `删除的话，这 ${amount} 会回到你的钱罐。`,
  undoIncoming: (amount) => `删除的话，这 ${amount} 会从你的钱罐里扣回。`,
  undoBorrow: '删除的话，这笔预支会取消。已经被存入还掉的部分会回到你的钱罐。',
  remove: '删除',

  sortAria: (label) => `排序：${label}`,
  sortBy: '排序方式',
  tapToFlip: '再点一次可反转顺序',
  sort: {
    created: '添加日期',
    name: '名称',
    balance: '余额',
    progress: '进度',
    split: '分配比例',
    aToZ: 'A → Z',
    zToA: 'Z → A',
    oldestFirst: '最旧在前',
    newestFirst: '最新在前',
    lowToHigh: '低 → 高',
    highToLow: '高 → 低',
  },
};
