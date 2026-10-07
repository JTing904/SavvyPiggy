import type { invite as English } from '../en/invite';

export const invite: typeof English = {
  rowTitle: '邀请朋友',
  rowSub: '生成一个 10 分钟有效的邀请码',
  title: '邀请朋友',

  idleIntro: '点一下，就生成一个只能用一次、10 分钟内有效的邀请码。',
  generate: '生成邀请码',
  replaceNote: '再次生成时，上一个还没用的码会立刻作废。',
  making: '正在生成……',
  failed: '没能生成邀请码。检查网络后再试一次。',

  liveIntro: '让对方在登录页扫这个二维码，或者输入下面的码。只能用一次。',
  timeLeft: (time) => `${time} 后失效`,
  copy: '复制',
  copied: '已复制',
  share: '分享',
  liveNote: '过期后这个码就作废了。需要的话再生成一个新的。',
  qrLabel: '邀请二维码',
  shareText: (code) => `来 SavvyPiggy 一起存钱吧。邀请码：${code}（只能用一次，10 分钟内有效）`,

  expiredIntro: '这个码已经失效。',
  expired: '已失效',
  makeNew: '生成新的邀请码',

  usedIntro: '对方已经加入了。',
  usedTitle: '朋友已加入 SavvyPiggy',
  usedBody: '这个码已经用掉，不会再生效。',
  makeAnother: '再生成一个',

  scan: '扫描二维码',
  scanHint: '输入邀请码，或者点扫码图标。',
  scanFailed: '没能打开扫码器。请直接输入邀请码。',
};
