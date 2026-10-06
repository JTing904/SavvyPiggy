import type { money as English } from '../en/money';

export const money: typeof English = {
  title: '记一笔',
  tabs: '要记什么',
  deposit: '存入',
  spend: '开销',

  quickAmounts: '快捷金额',

  goesTo: '存到',
  splitByPercent: '按分配比例',
  splitGoals: (n) => `${n} 个钱罐`,
  noSplit: '还没有钱罐设置分配比例。在上面选一个钱罐，或到「分配」设置百分比。',
  coversEarlier: (amount) => `${amount} 会先还清之前的预支`,
  partlyAllocated: (percent) => `只分配了 ${percent}%，剩下的不归入任何钱罐。`,
  landsHeading: '这笔钱会存到',

  comesFrom: '从哪个钱罐出',
  spendAhead: '预支',
  spendAheadSmall: '不动钱罐',
  pickSource: '请选一个钱罐，或选「预支」。',
  spendAheadHint: '这笔钱你还没存下来。不动任何钱罐，你之后的存入会先把它还清。',
  overBalance: (amount) => `这个钱罐里只有 ${amount}。再开销就会变成负数。`,

  whatFor: '用途',
  note: '备注',
  notePlaceholder: '选填',
  spendAheadPlaceholder: '例如：午餐',
  spendPlaceholder: '例如：日用杂货',

  date: '日期',
  dateToday: '今天',
  backDated: '不是今天',
  pickDayTitle: '哪一天？',
  pickDayHint: '补记忘了记的一笔。只能选记录范围内的日子。',

  confirmDeposit: (amount) => `存入 ${amount}`,
  confirmSpend: (amount) => `记录开销 ${amount}`,
  recordSpending: '记录开销',
};
