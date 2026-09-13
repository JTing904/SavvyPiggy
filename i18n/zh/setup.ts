import type { setup as English } from '../en/setup';

export const setup: typeof English = {
  styleTitle: '你的风格',
  notNow: '以后再说',
  gate: '第一次买入前，先回答六个问题。推荐会按你想从股票得到什么来挑。',
  questionOf: (n, total) => `第 ${n} 题，共 ${total} 题`,
  seeMyStyle: '看我的风格',

  questions: [
    {
      text: '你买股票主要想要什么？',
      options: ['每年股息越多越好', '钱按时、稳定地进来', '股价上涨'],
    },
    {
      text: '拿到股息，你通常会怎么用？',
      options: ['再买更多股票', '花掉，或者补贴生活开销', '没想过'],
    },
    {
      text: '股价跌了 20%，但股息照样派。你会……',
      options: ['不在意——股息还是照样来', '有点担心', '想卖掉'],
    },
    {
      text: '你希望多久收到一次股息？',
      options: ['越频繁越好，比如每季一次', '一年一两次就行', '无所谓'],
    },
    {
      text: '二选一：',
      options: ['股息率 6%，股价好几年几乎不动', '股息率 2%，股价每年涨 8%'],
    },
    {
      text: '你打算持有多久？',
      options: ['不到一年', '一到五年', '五年以上'],
    },
  ],

  fromAnswers: '根据你的回答',
  mixHint: '可以拖动调整，三个加起来永远是 100%。',
  styles: {
    income: { name: '股息派', blurb: '股息持续派发，不被削减。' },
    cash: { name: '现金流派', blurb: '同样的钱，拿到最高的股息率。' },
    price: { name: '股价派', blurb: '看总回报，主要靠股价上涨。' },
  },
  record: (hit, random) => `在你清单上的成绩单：命中 ${hit} · 随便挑 ${random}`,
  noBetter: '——不比随便挑好',
  noRecord: '你的清单历史还不够，暂时没法测试',
  redoQuestions: '重新回答问题',
  continueToBuy: '继续买入',
  redoNote: '随时可以在个人资料或每月定投页面重新做。',

  brokerTitle: '你的券商',
  brokerFirstTitle: '你在哪里买股票？',
  brokerHint: '手续费按你券商公布的费率计算。之后可以更改。',
  brokerFirstHint: '每笔交易的手续费都会按你券商公布的费率自动填好。之后可以更改。',
  percentMin: (pct, min) => `${pct}，最低 ${min}`,
  percentPlusFlat: (pct, flat) => `${pct} + 每单 ${flat} 平台费`,
  tierUnder: (fee, upTo) => `${upTo} 以下 ${fee}`,
  tierFrom: (fee, from) => `${from} 起 ${fee}`,
  notListed: '我的券商不在列表里',
  notListedHint: '自己输入券商的费率',
  customName: '我自己的费率',
  percentLabel: '佣金（%）',
  minimumLabel: '每笔最低（RM）',
  flatLabel: '每单固定费用（RM）',
  optional: '选填',
  useTheseRates: '使用这些费率',
  customError: {
    percent: '请输入 0 到 2 之间的百分比。',
    minimum: '请输入 RM0 到 RM100 之间的最低收费。',
    flat: '请输入 RM0 到 RM100 之间的固定费用。',
    both: '最低收费和固定费用只能填一个。',
  },
  brokerNote:
    '费率取自各券商官网的收费页面（2026 年 9 月 13 日），适用于一般的马股。REIT 的佣金和结算费另收 8% 服务税（SST）。一切以你的成交单为准。',
};
