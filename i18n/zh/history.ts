import type { history as English } from '../en/history';

export const history: typeof English = {
  title: '记录',
  subtitle: '每一笔存入，以及它去了哪里。',
  pickMonth: '选择月份',
  totalSaved: (month) => `${month}存入合计`,
  nothingSavedBefore: '上个月没有存入。',
  comparedWithBefore: '与上个月相比。',
  activityFeed: '收支动态',
  nothingIn: (month) => `${month}没有记录`,
  pickAnotherMonth: '用上方的日历选择其他月份',

  dayToday: (date) => `今天 · ${date}`,
  dayYesterday: (date) => `昨天 · ${date}`,
  dayOther: (weekday, date) => `${weekday} · ${date}`,

  savedAmount: (amount) => `存入 ${amount}`,
  spentAmount: (amount) => `开销 ${amount}`,
  spentAheadAmount: (amount) => `预支 ${amount}`,
  toDebt: (amount) => `还预支 ${amount}`,

  tradeTitle: (label, counter) => `${label} · ${counter}`,
  fromGoal: (goal) => `从 ${goal} 出`,
  intoGoal: (goal) => `存进 ${goal}`,
  splitAcross: (n) => `分到 ${n} 个钱罐`,
  coveredSpentAhead: (amount) => `补回预支 ${amount}`,
  sharesMoved: (moves) => `投资 ${moves}`,
  openTrade: '打开这笔交易',

  noGoalTouched: '没有动到任何钱罐——之后存入的钱会先补上这笔，再进到钱罐。',
  deletedGoal: '已删除的钱罐',

  removeTitle: '删除这笔记录？',
  remove: '删除',
  undoOutgoing: (amount) => `这 ${amount} 会回到你的钱罐。`,
  undoBorrow: '这笔预支会取消。已经被存入还掉的部分会回到你的钱罐。',
  undoIncoming: (amount) => `这 ${amount} 会从你的钱罐里扣回。`,

  whatWasThisFor: '这笔花在哪里？',
  labelOnly: '只改分类，钱不会动。',

  jumpToMonth: '跳到某个月',
  onlyMonthsWithRecords: '只列出有记录的月份。',
  showEarlierMonths: '显示更早的月份',

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
