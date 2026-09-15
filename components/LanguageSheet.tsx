import React from 'react';
import type { Lang } from '../i18n';
import { useLanguage, useT } from '../contexts/LanguageContext';
import { useBackHandler } from '../hooks/useBackHandler';

/**
 * Changing the language from Profile. Each option is also named in the other
 * language, so someone who switched by mistake can still find their way back.
 */

const OPTIONS: { lang: Lang; label: string; other: string }[] = [
  { lang: 'zh', label: '简体中文', other: 'Simplified Chinese' },
  { lang: 'en', label: 'English', other: '英文' },
];

const LanguageSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const { lang, setLanguage } = useLanguage();
  useBackHandler(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 veil-in" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb max-h-[90dvh] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <h3 className="text-white text-2xl font-black tracking-tight">{t.language.title}</h3>
        <p className="text-slate-400 text-sm font-medium mt-2 leading-relaxed">{t.language.hint}</p>

        <div className="mt-5 space-y-2.5">
          {OPTIONS.map((option) => {
            const on = option.lang === lang;
            return (
              <button
                key={option.lang}
                type="button"
                onClick={() => {
                  setLanguage(option.lang);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left active:scale-[0.98] transition-all ${
                  on ? 'bg-primary/10 border-primary/40' : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-base font-black">{option.label}</p>
                  <p className="text-slate-500 text-xs font-bold mt-0.5">{option.other}</p>
                </div>
                {on && <span className="material-symbols-rounded text-primary fill-1">check_circle</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LanguageSheet;
