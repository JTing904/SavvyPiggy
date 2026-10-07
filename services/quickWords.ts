/**
 * The words the one-line entry understands, in Chinese, English and Malay.
 *
 * A fixed list on purpose: a short line is read by rules a person can learn,
 * not guessed at. A word that points at two different categories is ignored,
 * and a line with no word from here is filed under "Other", exactly as an
 * entry with no category always was.
 */

/** Category key → words that point at it. Latin words are matched whole, lower-case; Chinese by containment. */
export const CATEGORY_WORDS: Record<string, string[]> = {
  food: [
    '早餐', '午餐', '晚餐', '宵夜', '早饭', '午饭', '晚饭', '吃饭', '咖啡', '奶茶', '饮料', '餐', '外卖',
    'breakfast', 'lunch', 'dinner', 'supper', 'food', 'coffee', 'kopi', 'tea', 'teh', 'makan', 'minum', 'mamak', 'drink', 'snack', 'kfc', 'mcd', 'starbucks',
    'sarapan', 'makanan',
  ],
  groceries: [
    '买菜', '菜市场', '超市', '杂货', '日用品',
    'groceries', 'grocery', 'market', 'tesco', 'aeon', 'lotus', 'lotuss', 'mydin', 'speedmart', 'giant', 'pasar', 'runcit',
  ],
  transport: [
    '交通', '车费', '加油', '油费', '停车', '过路费', '的士', '地铁', '巴士', '火车', '打车',
    'grab', 'petrol', 'fuel', 'parking', 'toll', 'taxi', 'lrt', 'mrt', 'bus', 'ktm', 'minyak', 'parkir', 'tol',
  ],
  bills: [
    '电费', '水费', '网费', '话费', '账单', '房租', '租金', '保险', '手机费',
    'bill', 'bills', 'electricity', 'water', 'internet', 'wifi', 'rent', 'insurance', 'unifi', 'astro', 'netflix', 'spotify',
    'bil', 'elektrik', 'sewa', 'insurans',
  ],
  shopping: ['购物', '衣服', '鞋', '包包', 'shopping', 'shopee', 'lazada', 'clothes', 'shoes', 'beli', 'baju', 'kasut'],
  health: ['看病', '医生', '医院', '药', '牙医', 'clinic', 'doctor', 'pharmacy', 'guardian', 'watsons', 'hospital', 'dentist', 'klinik', 'ubat', 'doktor'],
  family: ['家人', '孩子', '小孩', '父母', '妈妈', '爸爸', '家用', 'family', 'kids', 'parents', 'mum', 'mom', 'dad', 'keluarga', 'anak'],
  fun: ['电影', '游戏', '娱乐', 'movie', 'movies', 'cinema', 'game', 'games', 'karaoke', 'tgv', 'gsc', 'wayang', 'permainan'],
  travel: ['旅行', '旅游', '机票', '酒店', '车票', 'travel', 'flight', 'hotel', 'airbnb', 'trip', 'agoda', 'penerbangan', 'hotel'],
  learning: ['学费', '书', '课程', '补习', 'tuition', 'course', 'book', 'books', 'class', 'yuran', 'buku', 'kursus'],
  gifts: ['礼物', '送礼', 'gift', 'present', 'hadiah'],
};

/** Words that make a line an income rather than spending. */
export const INCOME_WORDS = [
  '薪水', '工资', '薪资', '收入', '奖金', '入账', '收到', '收款',
  'salary', 'income', 'bonus', 'wage', 'payroll', 'received', 'gaji', 'pendapatan', 'bonus',
];

export const TODAY_WORDS = ['今天', '今日', 'today', 'hari ini'];
export const YESTERDAY_WORDS = ['昨天', '昨日', 'yesterday', 'kelmarin', 'semalam'];
export const DAY_BEFORE_WORDS = ['前天', '前日'];

/** Words that only introduce a goal's name ("from Car") and are not part of the note. */
export const FROM_WORDS = ['从', '用', 'from', 'dari', 'guna'];
