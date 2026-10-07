import React from 'react';
import { Tab } from '../types';
import { useT } from '../contexts/LanguageContext';
import type { Messages } from '../i18n';
import { Icon } from './ui/Icon';

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

const TABS: Record<Mode, { tab: Tab; icon: string; label: keyof Messages['nav'] }[]> = {
  save: [
    { tab: Tab.HOME, icon: 'home', label: 'home' },
    { tab: Tab.LOG, icon: 'hist', label: 'history' },
    { tab: Tab.BANKS, icon: 'pie', label: 'strategy' },
    { tab: Tab.STATS, icon: 'chart', label: 'report' },
  ],
  invest: [
    { tab: Tab.HOME, icon: 'home', label: 'home' },
    { tab: Tab.TRADES, icon: 'list', label: 'trades' },
    { tab: Tab.DIVIDENDS, icon: 'coin', label: 'dividends' },
    { tab: Tab.GROWTH, icon: 'trend', label: 'growth' },
  ],
};

/** The action button's job follows the mode; its colour does not (ink in every mode). */
const ACTION: Record<Mode, keyof Messages['nav']> = {
  save: 'depositOrSpend',
  invest: 'buyOrSell',
};

const Navigation: React.FC<NavigationProps> = ({ mode, activeTab, onTabChange, onQuickAction }) => {
  const t = useT();
  const tabs = TABS[mode];

  // Every tab takes an equal share and is allowed to shrink, so four labels
  // plus the action button always fit a narrow phone instead of overflowing.
  const renderTab = ({ tab, icon, label }: (typeof TABS)[Mode][number]) => {
    const on = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => onTabChange(tab)}
        aria-current={on ? 'page' : undefined}
        className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 ${on ? 'text-ink' : 'text-mute'} active:opacity-70`}
      >
        <Icon name={icon} size={22} strokeWidth={on ? 2.2 : 1.7} />
        <span className="w-full truncate text-center text-[10.5px] font-extrabold">{t.nav[label]}</span>
      </button>
    );
  };

  // Above the page: cards in the holdings stack carry their own z-index, and
  // without one here an expanded card paints straight over the bar.
  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 safe-pb">
      <div className="pointer-events-auto mx-auto max-w-md">
        <div className="flex items-center rounded-[2rem] bg-card p-2 font-figtree shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
          {tabs.slice(0, 2).map(renderTab)}

          <button
            type="button"
            onClick={onQuickAction}
            aria-label={t.nav[ACTION[mode]]}
            className="mx-1 -mt-9 grid size-14 shrink-0 place-items-center rounded-full bg-cta text-cta-fg shadow-[0_6px_16px_rgba(0,0,0,0.25)] active:scale-95"
          >
            <Icon name="plus" size={26} strokeWidth={2.4} />
          </button>

          {tabs.slice(2).map(renderTab)}
        </div>
      </div>
    </div>
  );
};

export default Navigation;
