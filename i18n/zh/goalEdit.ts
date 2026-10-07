import type { goalEdit as English } from '../en/goalEdit';

export const goalEdit: typeof English = {
  // The goal's page
  edit: '编辑',
  editGoal: '编辑钱罐',
  shareHint: '在「分配比例」页修改',

  // The edit sheet
  editTitle: '编辑钱罐',
  nameLabel: '钱罐名称',
  namePlaceholder: '例如：新手机',
  targetLabel: '目标金额',
  noLimit: '无上限',
  noLimitHint: '没有终点，想存多久都可以。',
  targetMissing: '请输入目标金额，或打开「无上限」。',
  countsAsFull: '这个钱罐会算作已存满，因为它的余额已经达到或超过目标金额。',
  iconLabel: '图标',
  save: '保存',
  saving: '保存中…',
  saved: '钱罐已更新',
  couldNotSave: '无法保存你的修改。',

  // The icon picker
  iconMore: '更多',
  chooseIcon: '选择图标',
  searchIcons: '搜索图标',
  searchPlaceholder: '搜索，例如：旅行、cuti、trip',
  noIconFound: (query) => `找不到和「${query}」相符的图标。`,
  iconGroup: (group) => `分类：${group}`,

  // Creating a goal
  createTitle: '新钱罐',
  createCta: '创建钱罐',
  coverPhoto: '封面照片',
  photoAdd: '添加照片',
  photoChange: '更换照片',
  shareOfDeposits: '参与分配',
  shareOn: '每笔存入都会分一部分给它',
  shareOff: '分配存入时会跳过它',
  startsAtZero: '新钱罐的分配比例从 0% 开始，到「分配比例」页设定它的份额。',
  onlyGoal: '这是你唯一的钱罐，每笔存入都会放进它。',
};
