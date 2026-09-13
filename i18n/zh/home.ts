import type { home as English } from '../en/home';

export const home: typeof English = {
  greeting: {
    morning: '早上好',
    afternoon: '下午好',
    evening: '晚上好',
  },
  defaultName: '储蓄达人',
  alerts: '提醒',

  ago: {
    justNow: '刚刚',
    minutes: (n) => `${n} 分钟前`,
    hours: (n) => `${n} 小时前`,
    days: (n) => `${n} 天前`,
  },

  scheduledDeposit: '自动存入',

  totalSavings: '总储蓄',
  savedToday: '今日存入',
  deposit: '存入',
  investments: '投资',
  trackHoldings: '记录你的 Bursa 持股',
  trackHoldingsHint: '自动为你报价，和储蓄分开管理。',
  getStarted: '开始使用',
  today: '今日',
  counters: (n) => `${n} 只股票`,
  view: '查看',

  debtHint: '存入的钱会先还清这笔，剩下的才进你的钱罐。',
  spentAmountAhead: (amount) => `预支了 ${amount}`,
  netAfterDebt: '扣除预支后',

  yourPiggyBanks: '我的钱罐',
  noPiggyBanks: '还没有创建钱罐。',
  saved: '已存',
  overspent: '超支',
  amountState: (amount, state) => `${state} ${amount}`,

  recentActivity: '最近记录',
  noRecentActivity: '暂无最近记录。',

  noCounters: '还没有股票',
  noCountersHint: '用下面的按钮记录一笔买入，这里就会为它报价和追踪。',
  yourCounters: '我的股票',
  noPrices: '还没有价格——联网后就会更新。',
  priced: (ago) => `${ago}更新报价`,
  heldAtCost: (n) => `${n} 只按成本计`,
  allTrades: (n) => `全部交易（${n}）`,

  sheet: {
    spend: '开销',
    goesTo: '存到',
    comesFrom: '从哪里出',
    borrowHint: '这笔钱你还没存下来。不动任何钱罐——你之后的存入会先把它还清。',
    inThisGoal: (amount) => `这个钱罐里有 ${amount}。再开销就会变成负数。`,
    whatFor: '用途',
    borrowPlaceholder: '例如：午餐',
    spendPlaceholder: '例如：日用杂货',
    coversEarlier: (amount) => `${amount} 会先还清之前的预支`,
    partlyAllocated: (percent) => `只分配了 ${percent}%，剩下的不归入任何钱罐。`,
    noSplit: '还没有钱罐设置分配比例——在上面选一个，或到「分配」设置百分比。',
    confirmDeposit: '确认存入',
    recordSpending: '记录开销',
    withdraw: '取出',
  },

  stack: {
    marketValue: '市值',
    today: (amount) => `今日 ${amount}`,
    units: '股',
    avgCost: '均价',
    invested: '投入',
    gain: '盈亏',
    noPrice: '这只股票暂时没有价格——先按你买入的成本计算。',
    buyMore: '再买入',
    sell: '卖出',
  },
};
