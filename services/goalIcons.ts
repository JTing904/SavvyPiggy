/**
 * The icons a goal can wear: Material Symbols Rounded names, in groups, with
 * the words a person would type to look for one. The catalogue lives here
 * rather than in i18n because the keywords are search data, not UI text.
 */

export interface GoalIconGroup {
  key: string;
  en: string;
  zh: string;
  /** Group-wide search words; every icon of the group answers to them. */
  keywords: { en: string[]; zh: string[]; ms: string[] };
  /** `kw` are extra words for one icon, English, Chinese or Malay alike. */
  icons: { name: string; kw?: string[] }[];
}

export const GOAL_ICON_GROUPS: GoalIconGroup[] = [
  {
    key: 'travel',
    en: 'Travel',
    zh: '旅行',
    keywords: { en: ['trip', 'holiday', 'vacation', 'travel'], zh: ['旅游', '度假', '出国'], ms: ['cuti', 'melancong', 'percutian'] },
    icons: [
      { name: 'flight', kw: ['flight', 'plane', 'ticket', 'airasia', 'penerbangan', '机票', '飞机'] },
      { name: 'beach_access', kw: ['beach', 'island', 'langkawi', 'pantai', '海边', '海滩'] },
      { name: 'luggage', kw: ['luggage', 'suitcase', 'bagasi', '行李'] },
      { name: 'hotel', kw: ['hotel', 'stay', 'resort', 'penginapan', '酒店', '住宿'] },
      { name: 'camping', kw: ['camp', 'tent', 'perkhemahan', '露营'] },
    ],
  },
  {
    key: 'faith',
    en: 'Faith & giving',
    zh: '信仰与捐献',
    keywords: {
      en: ['hajj', 'umrah', 'zakat', 'sedekah', 'charity', 'donation', 'tithe', 'prayer', 'worship'],
      zh: ['朝圣', '捐款', '捐献', '善款', '奉献', '祈祷'],
      ms: ['haji', 'umrah', 'zakat', 'sedekah', 'derma', 'wakaf', 'korban', 'qurban', 'ibadah'],
    },
    icons: [
      { name: 'mosque', kw: ['mosque', 'masjid', 'islam', 'muslim', 'umrah', 'hajj', 'haji', 'raya', '朝圣', '清真寺', '穆斯林'] },
      { name: 'temple_buddhist', kw: ['buddhist', 'buddha', 'temple', 'kuil', '佛', '寺庙'] },
      { name: 'temple_hindu', kw: ['hindu', 'temple', 'thaipusam', 'deepavali', 'kuil', '印度教', '屠妖节'] },
      { name: 'church', kw: ['church', 'christian', 'christmas', 'gereja', '教会', '教堂', '圣诞'] },
      { name: 'volunteer_activism', kw: ['volunteer', 'give', 'help', 'zakat', 'sedekah', 'donation', 'donate', 'derma', '捐款', 'sukarelawan', '义工', '公益'] },
    ],
  },
  {
    key: 'home',
    en: 'Home',
    zh: '居家',
    keywords: {
      en: ['renovation', 'house', 'home', 'mortgage', 'rent', 'furniture', 'downpayment'],
      zh: ['装修', '买房', '房子', '房贷', '家具', '搬家'],
      ms: ['rumah', 'ubahsuai', 'sewa', 'perabot', 'pinjaman rumah', 'deposit rumah'],
    },
    icons: [
      { name: 'home', kw: ['house', 'rumah', '房子', '家'] },
      { name: 'apartment', kw: ['condo', 'flat', 'apartment', 'pangsapuri', '公寓'] },
      { name: 'key', kw: ['key', 'keys', 'kunci', '钥匙'] },
      { name: 'chair', kw: ['furniture', 'sofa', 'perabot', '家具', '沙发'] },
      { name: 'handyman', kw: ['repair', 'tools', 'renovation', 'baiki', '维修', '工具'] },
    ],
  },
  {
    key: 'vehicles',
    en: 'Vehicles',
    zh: '交通工具',
    keywords: {
      en: ['car', 'vehicle', 'motorbike', 'bike', 'road tax'],
      zh: ['汽车', '车', '摩托', '单车', '路税'],
      ms: ['kereta', 'motor', 'motosikal', 'kenderaan', 'cukai jalan', 'basikal'],
    },
    icons: [
      { name: 'directions_car', kw: ['car', 'kereta', 'proton', 'perodua', 'myvi', '汽车'] },
      { name: 'motorcycle', kw: ['motorcycle', 'scooter', 'motor', 'motosikal', '摩托车'] },
      { name: 'electric_car', kw: ['electric', 'tesla', 'ev', 'elektrik', '电动车'] },
      { name: 'pedal_bike', kw: ['bicycle', 'cycling', 'basikal', '单车', '脚车'] },
      { name: 'car_repair', kw: ['service', 'servis', 'maintenance', 'insurance', 'insurans', '保养', '维修'] },
    ],
  },
  {
    key: 'family',
    en: 'Family & pets',
    zh: '家人与宠物',
    keywords: {
      en: ['baby', 'kids', 'child', 'family', 'pet', 'parents', 'newborn'],
      zh: ['宝宝', '孩子', '家人', '宠物', '父母', '孝敬'],
      ms: ['bayi', 'anak', 'keluarga', 'haiwan', 'ibu bapa', 'mak ayah'],
    },
    icons: [
      { name: 'child_care', kw: ['baby', 'newborn', 'bayi', '婴儿', '宝宝'] },
      { name: 'stroller', kw: ['stroller', 'pram', 'kereta sorong', '婴儿车'] },
      { name: 'toys', kw: ['toy', 'toys', 'mainan', '玩具'] },
      { name: 'pets', kw: ['dog', 'cat', 'kucing', 'anjing', 'vet', '猫', '狗'] },
      { name: 'elderly', kw: ['grandparents', 'parents', 'senior', 'warga emas', '长辈', '老人', '父母'] },
    ],
  },
  {
    key: 'education',
    en: 'Education',
    zh: '教育',
    keywords: {
      en: ['school', 'study', 'tuition', 'university', 'course', 'college', 'fees', 'ptptn'],
      zh: ['学费', '读书', '大学', '课程', '补习', '留学'],
      ms: ['sekolah', 'pendidikan', 'universiti', 'yuran', 'belajar', 'tuisyen', 'kursus'],
    },
    icons: [
      { name: 'school', kw: ['school', 'sekolah', '学校'] },
      { name: 'backpack', kw: ['backpack', 'school bag', 'beg sekolah', '书包'] },
      { name: 'menu_book', kw: ['book', 'books', 'buku', '书'] },
      { name: 'history_edu', kw: ['exam', 'essay', 'writing', 'peperiksaan', '考试'] },
      { name: 'workspace_premium', kw: ['certificate', 'degree', 'graduation', 'sijil', 'ijazah', '毕业', '证书'] },
    ],
  },
  {
    key: 'health',
    en: 'Health',
    zh: '健康',
    keywords: {
      en: ['medical', 'health', 'doctor', 'hospital', 'dental', 'gym', 'fitness', 'surgery'],
      zh: ['医疗', '看病', '医院', '牙', '健身', '手术'],
      ms: ['kesihatan', 'perubatan', 'doktor', 'hospital', 'gigi', 'senaman'],
    },
    icons: [
      { name: 'medical_services', kw: ['clinic', 'klinik', 'medicine', 'ubat', '诊所', '药'] },
      { name: 'health_and_safety', kw: ['checkup', 'medical card', 'kad perubatan', '体检', '医药卡'] },
      { name: 'vaccines', kw: ['vaccine', 'injection', 'vaksin', '疫苗'] },
      { name: 'dentistry', kw: ['dentist', 'teeth', 'braces', 'doktor gigi', '牙医', '牙套'] },
      { name: 'fitness_center', kw: ['gym', 'workout', 'weights', 'senaman', '健身房'] },
    ],
  },
  {
    key: 'shopping',
    en: 'Shopping & food',
    zh: '购物与餐饮',
    keywords: {
      en: ['shopping', 'food', 'dining', 'groceries', 'clothes', 'gift', 'jewellery'],
      zh: ['购物', '餐饮', '美食', '衣服', '礼物', '首饰'],
      ms: ['membeli-belah', 'makan', 'makanan', 'baju', 'hadiah', 'barang dapur', 'kedai'],
    },
    icons: [
      { name: 'shopping_bag', kw: ['shop', 'sale', 'online', 'shopee', 'lazada', 'beli', '买东西'] },
      { name: 'restaurant', kw: ['restaurant', 'dinner', 'cafe', 'buffet', 'restoran', '餐厅', '吃饭'] },
      { name: 'checkroom', kw: ['wardrobe', 'outfit', 'fashion', 'baju raya', '衣橱', '新衣'] },
      { name: 'jewelry', kw: ['jewellery', 'jewelry', 'necklace', 'ring', 'bracelet', 'barang kemas', '项链', '戒指'] },
      { name: 'card_giftcard', kw: ['voucher', 'gift card', 'birthday gift', 'hadiah', '礼品卡', '礼物'] },
    ],
  },
  {
    key: 'tech',
    en: 'Tech',
    zh: '电子产品',
    keywords: {
      en: ['phone', 'laptop', 'gadget', 'computer', 'electronics', 'camera', 'tablet'],
      zh: ['手机', '电脑', '电子', '相机', '平板'],
      ms: ['telefon', 'komputer', 'elektronik', 'kamera', 'telefon bimbit'],
    },
    icons: [
      { name: 'smartphone', kw: ['phone', 'iphone', 'samsung', 'android', 'handphone', 'telefon', '手机'] },
      { name: 'laptop_mac', kw: ['laptop', 'macbook', 'notebook', 'pc', '电脑', '笔记本'] },
      { name: 'devices', kw: ['ipad', 'tablet', 'gadget', 'screen', 'tv', '平板', '电视'] },
      { name: 'headphones', kw: ['headphone', 'earbuds', 'airpods', 'audio', 'fon kepala', '耳机'] },
      { name: 'photo_camera', kw: ['camera', 'photo', 'dslr', 'kamera', '相机', '摄影'] },
    ],
  },
  {
    key: 'celebration',
    en: 'Celebrations & wedding',
    zh: '喜庆与婚礼',
    keywords: {
      en: ['wedding', 'ang pow', 'angpow', 'raya', 'birthday', 'party', 'festival', 'cny', 'anniversary'],
      zh: ['结婚', '红包', '婚礼', '生日', '派对', '春节', '过年', '周年'],
      ms: ['kahwin', 'kawin', 'perkahwinan', 'majlis', 'hari raya', 'duit raya', 'hari jadi', 'kenduri'],
    },
    icons: [
      { name: 'celebration', kw: ['party', 'celebrate', 'new year', 'pesta', '庆祝', '派对'] },
      { name: 'cake', kw: ['birthday', 'cake', 'hari jadi', 'kek', '生日', '蛋糕'] },
      { name: 'favorite', kw: ['wedding', 'marriage', 'engagement', 'nikah', 'tunang', 'love', '婚礼', '订婚', '爱'] },
      { name: 'local_florist', kw: ['flowers', 'bouquet', 'bunga', 'hantaran', '花', '花束'] },
      { name: 'redeem', kw: ['ang pow', 'angpow', 'hongbao', 'duit raya', 'green packet', 'gift', '红包', '礼物'] },
    ],
  },
  {
    key: 'money',
    en: 'Money & gold',
    zh: '黄金与投资',
    keywords: {
      en: ['gold', 'savings', 'investment', 'stocks', 'shares', 'fund', 'retirement', 'wealth', 'asb'],
      zh: ['黄金', '股票', '投资', '储蓄', '退休', '基金', '理财'],
      ms: ['emas', 'simpanan', 'pelaburan', 'saham', 'tabung', 'persaraan', 'unit amanah'],
    },
    icons: [
      { name: 'savings', kw: ['piggy', 'save', 'saving', 'tabung', '储蓄', '存钱'] },
      { name: 'paid', kw: ['cash', 'money', 'income', 'wang', 'duit', '现金', '钱'] },
      { name: 'diamond', kw: ['gold', 'emas', 'gold bar', 'precious', 'berlian', '黄金', '金条', '钻石'] },
      { name: 'trending_up', kw: ['stocks', 'invest', 'growth', 'bursa', 'saham', 'etf', '股票', '投资'] },
      { name: 'account_balance', kw: ['bank', 'fixed deposit', 'fd', 'epf', 'kwsp', '银行', '定存', '公积金'] },
    ],
  },
  {
    key: 'safety',
    en: 'Emergency & safety',
    zh: '应急与保障',
    keywords: {
      en: ['emergency', 'insurance', 'takaful', 'safety', 'security', 'rainy day', 'backup'],
      zh: ['应急', '保险', '保障', '备用金', '安全'],
      ms: ['kecemasan', 'insurans', 'takaful', 'keselamatan', 'dana kecemasan'],
    },
    icons: [
      { name: 'shield_with_heart', kw: ['emergency fund', 'dana kecemasan', 'protection', '应急金', '保护'] },
      { name: 'emergency', kw: ['urgent', 'sos', 'ambulance', 'kecemasan', '紧急'] },
      { name: 'umbrella', kw: ['rainy day', 'cover', 'payung', '雨天', '伞'] },
      { name: 'security', kw: ['lock', 'protect', 'alarm', 'kunci', '安防', '锁'] },
      { name: 'house_with_shield', kw: ['home insurance', 'fire insurance', 'insurans rumah', '房屋保险', '家居保险'] },
    ],
  },
  {
    key: 'hobbies',
    en: 'Hobbies & sports',
    zh: '兴趣与运动',
    keywords: {
      en: ['hobby', 'sports', 'gaming', 'game', 'music', 'movie', 'cinema', 'concert'],
      zh: ['兴趣', '运动', '游戏', '音乐', '电影', '演唱会'],
      ms: ['hobi', 'sukan', 'permainan', 'muzik', 'wayang', 'konsert'],
    },
    icons: [
      { name: 'sports_esports', kw: ['playstation', 'ps5', 'xbox', 'switch', 'console', 'konsol', '游戏机', '电玩'] },
      { name: 'badminton', kw: ['badminton', 'racket', 'raket', '羽毛球'] },
      { name: 'sports_soccer', kw: ['football', 'soccer', 'bola sepak', 'futsal', '足球'] },
      { name: 'movie', kw: ['film', 'netflix', 'wayang', '戏院'] },
      { name: 'music_note', kw: ['guitar', 'piano', 'gitar', '乐器'] },
    ],
  },
  {
    key: 'business',
    en: 'Business & life goals',
    zh: '事业与人生',
    keywords: {
      en: ['business', 'startup', 'career', 'goal', 'dream', 'shop', 'side hustle'],
      zh: ['事业', '创业', '生意', '梦想', '人生', '目标'],
      ms: ['perniagaan', 'bisnes', 'kerjaya', 'cita-cita', 'impian', 'kedai'],
    },
    icons: [
      { name: 'business_center', kw: ['work', 'office', 'job', 'kerja', 'pejabat', '工作', '公司'] },
      { name: 'storefront', kw: ['store', 'stall', 'gerai', '店', '摊位'] },
      { name: 'rocket_launch', kw: ['launch', 'mula', '启动'] },
      { name: 'flag', kw: ['milestone', 'target', 'sasaran', '里程碑'] },
      { name: 'trophy', kw: ['win', 'achievement', 'champion', 'pencapaian', '成就', '冠军'] },
    ],
  },
];

export const GOAL_ICONS: readonly string[] = GOAL_ICON_GROUPS.flatMap((g) => g.icons.map((i) => i.name));

export const GOAL_ICON_SET: ReadonlySet<string> = new Set(GOAL_ICONS);

/** What an unknown or missing icon shows as. */
const FALLBACK_ICON = 'savings';

export const iconGroupOf = (name: string): GoalIconGroup | undefined =>
  GOAL_ICON_GROUPS.find((g) => g.icons.some((i) => i.name === name));

export const isKnownGoalIcon = (name: string): boolean => GOAL_ICON_SET.has(name);

/**
 * Anything stored on a goal may be old or damaged: early versions kept
 * 'Celebration' with a capital, and an icon since dropped must not render as
 * its raw name. Lowercased first, then anything unknown falls back to savings.
 */
export const safeGoalIcon = (name: unknown): string => {
  const lower = typeof name === 'string' ? name.trim().toLowerCase() : '';
  return GOAL_ICON_SET.has(lower) ? lower : FALLBACK_ICON;
};

/**
 * Icons matching a typed query: every space-separated word has to turn up
 * somewhere in the icon's group label (either language), the group's words in
 * all three languages, the icon's own words, or its name read with spaces.
 * Catalogue order is kept. `lang` is accepted for callers' sake, but both
 * labels and all three keyword languages are always searched: a Malaysian user
 * types Malay and Chinese into an English app.
 */
export const searchGoalIcons = (query: string, _lang: 'en' | 'zh'): { name: string; groupKey: string }[] => {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out: { name: string; groupKey: string }[] = [];

  for (const g of GOAL_ICON_GROUPS) {
    const groupText = [g.en, g.zh, ...g.keywords.en, ...g.keywords.zh, ...g.keywords.ms].join('\n').toLowerCase();
    for (const icon of g.icons) {
      const text = `${groupText}\n${(icon.kw ?? []).join('\n').toLowerCase()}\n${icon.name.replace(/_/g, ' ')}`;
      if (tokens.every((t) => text.includes(t))) out.push({ name: icon.name, groupKey: g.key });
    }
  }
  return out;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A word of the goal's name, whole (a plural s allowed); Chinese has no spaces, so it is a plain substring. */
const mentions = (name: string, word: string): boolean => {
  const w = word.toLowerCase();
  if (/[^\x00-\x7f]/.test(w)) return name.includes(w);
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(w)}(s|es)?($|[^a-z0-9])`).test(name);
};

/**
 * A fitting icon for a goal name, or null when nothing in it is recognised.
 * An icon's own word beats a group word (so "Umrah trip" is a mosque, not a
 * plane), longer words beat shorter, and a group word alone picks the first
 * icon of its group.
 */
export const suggestIconFromName = (name: string): string | null => {
  const text = name.trim().toLowerCase();
  if (!text) return null;

  let bestIcon: string | null = null;
  let bestScore = 0;
  const consider = (icon: string, score: number) => {
    if (score > bestScore) {
      bestIcon = icon;
      bestScore = score;
    }
  };

  for (const g of GOAL_ICON_GROUPS) {
    for (const w of [...g.keywords.en, ...g.keywords.zh, ...g.keywords.ms]) {
      if (mentions(text, w)) consider(g.icons[0].name, w.length);
    }
    for (const icon of g.icons) {
      for (const w of icon.kw ?? []) if (mentions(text, w)) consider(icon.name, 1000 + w.length);
    }
  }
  return bestIcon;
};
