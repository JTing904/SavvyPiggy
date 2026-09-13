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
  scheduleGoalGone: (count) => `有 ${count} 条自动存入还指向已删除或封存的钱罐，没有存入。请到「自动存入」里给它换一个钱罐。`,
  coveredNowhere: '这笔预支已经被存入补回了。删掉它，那笔钱要放回钱罐——但现在分配比例加起来不到 100%，钱会没地方放。请先把分配比例设好。',
  goneShare: '这笔记录有一部分经过了一个已删除的钱罐。请选择这部分从哪里扣回或放回。',

  newGoal: '新钱罐',
  sampleGoals: {
    vacation: '旅行',
    emergencyFund: '应急基金',
    newTech: '新电子产品',
  },
  goalRemoval: {
    needsChoice: '这个钱罐里还有钱。删掉之前先选钱要搬去哪里。',
    noDestination: '没有别的钱罐可以把钱搬过去。',
    negativeSplit: '超支的钱罐只能把欠的钱转给一个钱罐。',
  },
  tradeMoney: {
    goalGone: '当初出钱的钱罐已经不在了。请选择钱要退回哪里。',
    saleGoalGone: '这笔卖出有一部分存进了已删除的钱罐。请选择从哪个钱罐扣回。',
    rowGone: '这笔卖出的记录已经被清理，没办法准确撤回当时的分配。',
    insufficient: '这个钱罐的钱不够付这笔交易。',
    nothingToSplit: '目前没有钱罐参与分配，没办法自动分配这笔钱。',
  },
};
