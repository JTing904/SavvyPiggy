import type { app as English } from '../en/app';

export const app: typeof English = {
  splash: {
    syncing: '正在同步你的储蓄',
    startingUp: '正在启动',
    checkingInvite: '正在核对你的邀请',
  },
  couldNotReach: '无法连接 Firestore',
  tryAgain: '重试',
  comingSoon: '功能即将推出',
  offline: '离线——显示的是上次同步到这部手机的内容',
  didNotSave: '没有保存成功',

  quick: {
    moveMoney: '存入或开销',
    recordTrade: '记录交易',
    deposit: '存入',
    spend: '开销',
    buy: '买入',
    sell: '卖出',
    saveHint: '不选钱罐的开销会记为预支——你之后的存入会先还清它，剩下的才进钱罐。',
    tradeHint: '每笔交易都记着成交的日期，而这个日期决定哪些股息归你。所以请填你实际交易的那天，不是你输入的那天。',
  },
};
