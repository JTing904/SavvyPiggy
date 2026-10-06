import type { firstRun as English } from '../en/firstRun';

export const firstRun: typeof English = {
  title: '先建一个钱罐',
  body: '钱罐是你为什么存钱。之后每笔存入都可以分给你的钱罐。',
  goals: {
    travel: '旅行基金',
    emergency: '紧急备用金',
    phone: '新手机',
    own: '我自己取名',
  },
  onlyGoalNote: '只有一个钱罐时，每笔存入都会自动放进它，不用再设定分配。',
  samples: '或者先加三个示例钱罐',
};
