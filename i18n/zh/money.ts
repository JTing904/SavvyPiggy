import type { money as English } from '../en/money';

export const money: typeof English = {
  title: '记一笔',
  tabs: '要记什么',
  deposit: '存入收入',
  spend: '开销',

  quickAmounts: '快捷金额',

  goesTo: '存到',
  byRule: '按你的规则',
  ruleSmall: (percent) => (percent >= 100 ? '全部进钱罐' : `${percent}% 进钱罐 · ${100 - percent}% 留钱包`),
  keepInWallet: '全放钱包',
  keepInWalletSmall: '以后再转',
  allToGoals: '全部进钱罐',
  allToGoalsSmall: '按各自比例',
  wallet: '钱包',
  coversEarlier: (amount) => `${amount} 会先还清之前的预支`,
  clearsOverdraft: (amount) => `${amount} 会先补上钱包的透支`,
  landsHeading: '这笔钱会存到',

  comesFrom: '从哪里出',
  pickSource: '请选这笔钱从哪里出。',
  overdrawnFrom: (held, over) => `钱包里只有 ${held}，这笔会让钱包透支 ${over}。下一笔收入会先补上它。`,
  overdrawnMore: (over) => `这笔会让钱包透支到 ${over}。下一笔收入会先补上它。`,
  overBalance: (amount) => `这个钱罐里只有 ${amount}。再开销就会变成负数。`,

  whatFor: '用途',
  note: '备注',
  notePlaceholder: '选填',
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
