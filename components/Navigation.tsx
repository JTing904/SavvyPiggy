import React from 'react';
import { Tab } from '../types';

/**
 * Which half of the app the bar is showing. Swiping the card on Home is what
 * changes it: saving and investing are two different jobs, and putting eight
 * destinations in one bar would serve neither.
 */
export type Mode = 'save' | 'invest';

interface NavigationProps {
  mode: Mode;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onQuickAction: () => void;
}

const TABS: Record<Mode, { tab: Tab; icon: string; label: string }[]> = {
  save: [
    { tab: Tab.HOME, icon: 'home', label: 'Home' },
    { tab: Tab.LOG, icon: 'history', label: 'History' },
    { tab: Tab.BANKS, icon: 'account_balance_wallet', label: 'Strategy' },
    { tab: Tab.STATS, icon: 'monitoring', label: 'Report' },
  ],
  invest: [
    { tab: Tab.HOME, icon: 'home', label: 'Home' },
    { tab: Tab.TRADES, icon: 'receipt_long', label: 'Trades' },
    { tab: Tab.DIVIDENDS, icon: 'payments', label: 'Dividends' },
    { tab: Tab.GROWTH, icon: 'trending_up', label: 'Growth' },
  ],
};

/** The action button's colour and job both follow the mode. */
const ACTION: Record<Mode, { tint: string; glow: string; label: string }> = {
  save: { tint: 'bg-primary', glow: 'shadow-primary/40', label: 'Deposit or spend' },
  invest: { tint: 'bg-accent', glow: 'shadow-accent/40', label: 'Buy or sell' },
};

const Navigation: React.FC<NavigationProps> = ({ mode, activeTab, onTabChange, onQuickAction }) => {
  const tabs = TABS[mode];
  const action = ACTION[mode];
  const tint = mode === 'save' ? 'text-primary' : 'text-accent';

  // Every tab takes an equal share and is allowed to shrink, so four labels
  // plus the action button always fit a narrow phone instead of overflowing.
  const renderTab = ({ tab, icon, label }: { tab: Tab; icon: string; label: string }) => (
    <button
      key={tab}
      onClick={() => onTabChange(tab)}
      className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 rounded-2xl transition-all ${
        activeTab === tab ? tint : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      <span className={`material-symbols-rounded ${activeTab === tab ? 'fill-1' : ''}`}>{icon}</span>
      <span className="w-full truncate text-center text-[9px] font-bold uppercase tracking-wide">
        {label}
      </span>
    </button>
  );

  // Above the page: cards in the holdings stack carry their own z-index, and
  // without one here an expanded card paints straight over the bar.
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pointer-events-none safe-pb">
      <div className="max-w-md mx-auto pointer-events-auto">
        <div className="flex items-center glass rounded-[2.5rem] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10">
          {tabs.slice(0, 2).map(renderTab)}

          <button
            onClick={onQuickAction}
            aria-label={action.label}
            className={`shrink-0 mx-1 size-14 -mt-12 flex items-center justify-center rounded-full text-black shadow-2xl border-4 border-bg-dark active:scale-90 transition-all ${action.tint} ${action.glow}`}
          >
            <span className="material-symbols-rounded text-3xl font-black">add</span>
          </button>

          {tabs.slice(2).map(renderTab)}
        </div>
      </div>
    </div>
  );
};

export default Navigation;
