import React from 'react';
import { Tab } from '../types';
import { useT } from '../contexts/LanguageContext';
import type { Messages } from '../i18n';
import { Icon } from './ui/Icon';

interface NavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

/** The four places. Report and the investing sub-pages keep their parent lit. */
const TABS: { tab: Tab; icon: string; label: keyof Messages['nav']; also?: Tab[] }[] = [
  { tab: Tab.HOME, icon: 'home', label: 'home' },
  { tab: Tab.BANKS, icon: 'target', label: 'goals' },
  { tab: Tab.INVEST, icon: 'trend', label: 'invest', also: [Tab.TRADES, Tab.DIVIDENDS, Tab.GROWTH] },
  { tab: Tab.LOG, icon: 'list', label: 'history', also: [Tab.STATS] },
];

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const t = useT();
  return (
    <nav aria-label={t.nav.home} className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-line/10 bg-card font-figtree">
      <div className="mx-auto flex h-[60px] max-w-md">
        {TABS.map(({ tab, icon, label, also }) => {
          const on = activeTab === tab || !!also?.includes(activeTab);
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-current={on ? 'page' : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 active:opacity-70 ${on ? 'text-cta' : 'text-mute'}`}
            >
              <Icon name={icon} size={22} strokeWidth={on ? 2.2 : 1.8} />
              <span className="w-full truncate text-center text-[11.5px] font-bold">{t.nav[label]}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default Navigation;
