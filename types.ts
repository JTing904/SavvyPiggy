
export interface PiggyBank {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  splitPercentage: number;
  icon: string;
  imageUrl: string;
  isLocked: boolean;
}

export interface Activity {
  id: string;
  type: 'auto-save' | 'manual';
  date: string;
  amount: number;
  distributions: { bankId: string; amount: number; percentage: number }[];
}

export enum Tab {
  HOME = 'home',
  STATS = 'stats',
  BANKS = 'banks',
  SETTINGS = 'settings',
  LOG = 'log'
}
