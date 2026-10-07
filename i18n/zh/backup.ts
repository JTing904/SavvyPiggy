import type { backup as English } from '../en/backup';

export const backup: typeof English = {
  rowTitle: '导出全部数据',
  rowSub: '钱罐、钱包、债务、账单、投资，一个文件',
  title: '导出全部数据',
  intro: '把你在 SavvyPiggy 里的一切存成一个文件，自己留一份备份。',
  fileWord: '数据',
  contains: '包含：钱罐和余额、全部记录、钱包、债务和贷款、账单、自动存入、投资和派息。不含：收据照片（太大），登录密码。',
  size: (kb, docs) => `约 ${kb} KB · ${docs} 项`,
  preparing: '正在读取你的数据……',
  save: '保存或分享文件',
  saving: '正在保存……',
  saved: '文件已保存',
  failed: '没能读取你的数据。检查网络后再试一次。',
};
