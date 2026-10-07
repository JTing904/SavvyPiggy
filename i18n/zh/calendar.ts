import type { calendar as English } from '../en/calendar';

export const calendar: typeof English = {
  previousWeek: '上一周',
  nextWeek: '下一周',
  previousMonth: '上个月',
  nextMonth: '下个月',
  showMonth: '展开整个月',
  showWeek: '只看这一周',
  pickMonth: '选择月份',

  dayNone: (date) => `${date}，没有记录`,
  dayEntries: (date, count, kinds) => `${date}，${count} 笔：${kinds}`,
  kindIn: '进',
  kindOut: '出',
  kindMoved: '转去投资',
  kindJoin: '、',

  summaryIn: (amount) => `进 ${amount}`,
  summaryOut: (amount) => `出 ${amount}`,
  summaryMoved: (amount) => `转 ${amount}`,
  summaryBack: (amount) => `转回 ${amount}`,

  clearDay: (date) => `回到全部（取消 ${date}）`,
  previousDay: '前一天',
  nextDay: '后一天',
  entryCount: (n) => `${n} 笔`,

  dayMoved: (amount) => `转去投资 ${amount}`,

  emptyAllTitle: '还没有记录',
  emptyAllBody: '存入、开销和转去投资都会按时间显示在这里，最新的在最上面。',
  emptyAllAction: '存一笔',
  emptyMonthTitle: (month) => `${month}没有记录`,
  emptyMonthBody: '选择其他月份，或回到今天。',
  emptyDayTitle: '这一天没有记录',
  emptyDayBody: '这一天没有存入、开销，也没有转去投资。',
  showWholeMonth: '看整个月',

  readingMonth: (month) => `正在读取${month}的记录…`,
  needsConnection: (month) => `读取${month}需要联网。读不到时不会显示一个看起来是空的月份。`,
  retry: '再试一次',

  pickerTitle: '跳到某个月',
  previousYear: '上一年',
  nextYear: '下一年',
  stateCleared: '已清除',
  stateLoad: '点一下读取',
  stateThisMonth: '本月',
  monthAria: (label, state) => (state ? `${label}，${state}` : label),
  onceNote: '最近 3 个月是即时的。更早的月份第一次点要读取一次（会用到一点点免费额度），读完之后在你关掉 app 之前不会再读。',
  clearedNote: '灰色「已清除」的月份已经超过你设的保留期，导出的月结单还在。',
};
