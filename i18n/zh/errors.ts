import type { errors as English } from '../en/errors';

export const errors: typeof English = {
  chooseImage: '请选择图片文件。',
  imageTooLarge: '图片必须小于 5 MB。',
  imageUnreadable: '无法读取这张图片。',
  imageUnprocessable: '无法处理这张图片。',
  imageTooDetailed: '这张图片太大，存不下。换一张小一点的试试。',
  canvasUnavailable: '这台设备无法绘制月结单。',

  inviteInvalid: '这不像是有效的邀请码。',
  inviteMissing: '没有这个邀请码。',
  inviteUsed: '这个邀请码已经被用过了。',
  inviteJustClaimed: '这个邀请码刚被别人抢先用了。',
  googleCancelled: '已取消 Google 登录。',

  nothingToDepositInto: '没有可以存入的钱罐。',
  enterWithdrawAmount: '请输入开销金额。',
  enterSpendAmount: '请输入开销金额。',
  editRepaidDebt: '这笔记录补回过预支，不能修改。请删除后重新记录。',
  editDeletedGoal: '这笔记录存入的钱罐有一个已被删除，无法修改。',

  newGoal: '新钱罐',
  sampleGoals: {
    vacation: '旅行',
    emergencyFund: '应急基金',
    newTech: '新电子产品',
  },
};
