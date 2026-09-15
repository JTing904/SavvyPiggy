import type { common as English } from '../en/common';

export const common: typeof English = {
  cancel: '取消',
  confirm: '确认',
  save: '保存',
  saveChanges: '保存修改',
  delete: '删除',
  close: '关闭',
  back: '返回',
  done: '完成',
  edit: '编辑',
  next: '下一步',
  today: '今天',
  yesterday: '昨天',
  viewAll: '查看全部',
  somethingWentWrong: '出了点问题。',

  older: {
    loading: '正在载入较早的记录……',
    failed: '较早的记录载入不了，可能没有联网。为免显示不完整的总额，这里先不显示。',
    retry: '再试一次',
  },

  activity: {
    autoSave: '自动存入',
    manual: '存入',
    withdraw: '开销',
    borrow: '预支',
    invest: '买股',
    divest: '卖股所得',
    transfer: '转入',
    toInvest: '转去投资',
    fromInvest: '从投资转回',
  },

  categories: {
    food: '餐饮',
    groceries: '日用杂货',
    transport: '交通',
    bills: '账单',
    shopping: '购物',
    health: '医疗',
    family: '家庭',
    fun: '娱乐',
    travel: '旅行',
    learning: '学习',
    gifts: '礼物',
    other: '其他',
  },

  dividendNote: (name) => `${name} 股息`,
  movedFrom: (label, goal) => `${label} · 来自「${goal}」`,
  units: (n) => `${n} 股`,
  goal: '钱罐',
  goals: '钱罐',
  autoSplit: '自动分配',
  notFromGoal: '不从钱罐出',
  spentAhead: '预支',

  weekdaysNarrow: ['日', '一', '二', '三', '四', '五', '六'],
  weekdaysShort: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  weekdaysLong: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
};
