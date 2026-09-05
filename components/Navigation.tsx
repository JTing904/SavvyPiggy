
import React from 'react';
import { Tab } from '../types';

interface NavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onQuickAction: () => void;
}

const LEFT_TABS = [
  { tab: Tab.HOME, icon: 'home', label: 'Home' },
  { tab: Tab.LOG, icon: 'history', label: 'History' },
] as const;

const RIGHT_TABS = [
  { tab: Tab.BANKS, icon: 'account_balance_wallet', label: 'Strategy' },
  { tab: Tab.STATS, icon: 'monitoring', label: 'Report' },
] as const;

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, onQuickAction }) => {
  // Every tab takes an equal share and is allowed to shrink, so four labels
  // plus the action button always fit a narrow phone instead of overflowing.
  const renderTab = ({ tab, icon, label }: { tab: Tab; icon: string; label: string }) => (
    <button
      key={tab}
      onClick={() => onTabChange(tab)}
      className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 rounded-2xl transition-all ${
        activeTab === tab ? 'text-primary' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      <span className={`material-symbols-rounded ${activeTab === tab ? 'fill-1' : ''}`}>{icon}</span>
      <span className="w-full truncate text-center text-[9px] font-bold uppercase tracking-wide">
        {label}
      </span>
    </button>
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 pointer-events-none safe-pb">
      <div className="max-w-md mx-auto pointer-events-auto">
        <div className="flex items-center glass rounded-[2.5rem] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10">
          {LEFT_TABS.map(renderTab)}

          <button
            onClick={onQuickAction}
            aria-label="Deposit or spend"
            className="shrink-0 mx-1 size-14 -mt-12 flex items-center justify-center bg-primary rounded-full text-black shadow-2xl shadow-primary/40 border-4 border-bg-dark active:scale-90 transition-transform"
          >
            <span className="material-symbols-rounded text-3xl font-black">add</span>
          </button>

          {RIGHT_TABS.map(renderTab)}
        </div>
      </div>
    </div>
  );
};

export default Navigation;
