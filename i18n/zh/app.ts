import type { app as English } from '../en/app';

export const app: typeof English = {
  splash: {
    syncing: '正在同步你的储蓄',
    startingUp: '正在启动',
    checkingInvite: '正在核对你的邀请',
  },
  couldNotReach: '连接不上服务器',
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
  toast: {
    deposited: (amount: string) => `已存入 ${amount}`,
    spent: (amount: string) => `已记录开销 ${amount}`,
    spentAhead: (amount: string) => `已预支 ${amount}`,
    movedToInvesting: (amount: string) => `${amount} 已转去投资资金`,
    movedBack: (amount: string) => `${amount} 已转回钱罐`,
    goalArchived: (name: string) => `已封存「${name}」`,
    autoDepositSaved: '自动存入已保存',
    autoDepositOn: '自动存入已开启',
    autoDepositOff: '自动存入已暂停',
    autoDepositDeleted: '自动存入已删除',
    goalCreated: '钱罐已建立',
    samplesAdded: '已加入三个示范钱罐',
    entrySaved: '记录已更新',
    entryDeleted: '记录已删除',
    potMoveSaved: '这笔转移已更新',
    potMoveDeleted: '这笔转移已删除',
    deleteFailed: '删除不成功，这笔记录已放回列表。',
  },
};
