import type { alerts as English } from '../en/alerts';

export const alerts: typeof English = {
  title: '通知中心',
  allCaughtUp: '全部看完了。',
  newAlerts: (n) => `${n} 条新通知`,
  markAllRead: '全部标为已读',

  filters: {
    all: '全部',
    deposits: '存入',
    milestones: '里程碑',
    streaks: '连续天数',
  },

  justNow: '刚刚',
  minutesAgo: (n) => `${n} 分钟前`,
  updates: (n) => `${n} 条`,

  deletedGoal: '已删除的钱罐',

  receiptTitle: (amount) => `自动存入已入账（${amount}）`,
  milestoneTitle: (name, amount) => `${name} 突破 ${amount}`,
  reachedTitle: (name) => `钱罐达标：${name}`,
  streakTitle: (days) => `连续存钱 ${days} 天`,
  housekeepingTitle: '旧记录可以清理了',
  dividendTitle: (counter, amount) => `${counter} 派发了 ${amount}`,

  splitAcross: (n) => `分到 ${n} 个钱罐：`,
  milestoneBefore: '一笔存入让',
  milestonePast: '突破了 ',
  milestoneEnd: '。',
  milestoneLeft: (amount) => `还差 ${amount} 就达标。`,
  reachedTarget: (amount) => `达标了，存满 ${amount} 的目标。`,
  reachedStillTakes: (percent) => `它仍然占每笔存入的 ${percent}%。`,
  reachedOverflow: '它的份额现在会自动分给你的其他钱罐。',
  stillAllocated: (percent) => `仍在分配：${percent}%`,
  reallocate: '重新分配',
  streakBody: (days) => `你已经连续 ${days} 天往钱罐里存钱了，继续保持！`,
  housekeepingBody: (months) =>
    `应用每次打开都会读取你的全部记录，所以超过 ${months ?? ''} 个月的记录会被清理，让应用保持流畅。没有在那里列出过的记录都不会被删除。先到「报表 → 月结单」把那几个月保存下来，或者更改保留时长。你的余额不会受影响。`,
  dividendBody: (units) =>
    `按你在除权日持有的 ${units} 股计算，按公布的金额存进你的投资钱罐。请核对实际到账的金额——如果少了，把差额从投资钱罐转出。`,

  dailySavingsReminder: '每日存钱提醒',
  everyEveningAt: '每晚 ',
  reminderOff: '已关闭 · 提醒你别断了连续天数',
  blockedTitle: 'Android 阻止了这些通知',
  blockedBody:
    '你允许通知之前，什么提醒都设不了。打开「设置 → 应用 → SavvyPiggy → 通知」开启后再回来，这个页面会自己重新检查。',
  lateTitle: '提醒可能会迟到',
  lateBody: 'Android 可以把这些提醒延后最多一小时，手机休眠时甚至会跳过。允许精确闹钟，说 20:00 就是 20:00。',
  allowExact: '允许精确闹钟',
  emptyTitle: '这里还没有内容',
  emptyBody: '里程碑、自动存入的入账明细和连续天数，一发生就会出现在这里。',

  deliveryPreferences: '通知设置',
  receiptsTitle: '自动存入的入账明细',
  receiptsHint: '每次规则完成一笔存入，这里就会出现一张卡片。',
  milestonesTitle: '里程碑和连续天数',
  milestonesHint: '钱罐突破整数金额或达标时，以及连续存钱 7、30、100 和 365 天时。',
  dailyReminder: '每日提醒',
  dailyReminderHint: '每晚一条系统通知。',
  remindMeAt: '几点提醒你？',
  remindHint: '选一个你通常有空存点钱的时间。',
  monthlyReport: '月报',
  monthlyReportHint: '每月 1 日 09:00，打开上个月的报表。',
  exDates: '除权日',
  exDatesHint: '你持有的股票除权前两天提醒你——这一天决定股息是不是你的。',
  footer:
    '提醒设在这部手机上，应用关着也会响。自动存入本身只在你打开应用时才会入账（SavvyPiggy 没有服务器），所以到期的规则会在 09:00 提醒你打开应用。',

  notify: {
    channelName: '提醒',
    channelDescription: '存钱提醒、自动存入提醒和除权日提醒。',
    reminderTitle: '该存钱啦',
    reminderBody: '今天存一点，别断了连续天数。',
    digestTitle: '你的月报出炉了',
    digestBody: '看看上个月存入的钱去了哪里，存得有多快。',
    dueTitle: (amount) => `今天有一笔 ${amount} 的自动存入`,
    dueBody: '打开 SavvyPiggy，把它存进你的钱罐。',
    exTitle: (symbol) => `${symbol} 两天后除权`,
    exBodyHeld: (rate, units) => `每股 ${rate}。你持有 ${units} 股。`,
    exBodyNone: (rate) => `每股 ${rate}。在除权日之前买入才能拿到股息。`,
  },
};
