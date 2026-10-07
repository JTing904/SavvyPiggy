import React from 'react';
import type { Lang } from '../i18n';
import { useLanguage, useT } from '../contexts/LanguageContext';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';

/**
 * Changing the language from Settings. Each option is also named in the other
 * language, so someone who switched by mistake can still find their way back.
 */

const OPTIONS: { lang: Lang; label: string; other: string }[] = [
  { lang: 'zh', label: '简体中文', other: 'Simplified Chinese' },
  { lang: 'en', label: 'English', other: '英文' },
];

const LanguageSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const { lang, setLanguage } = useLanguage();

  return (
    <Sheet title={t.language.title} onClose={onClose}>
      <p className="mb-3 px-1 text-[13.5px] font-medium leading-relaxed text-mute">{t.language.hint}</p>
      <div className="space-y-2.5">
        {OPTIONS.map((option) => {
          const on = option.lang === lang;
          return (
            <button
              key={option.lang}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setLanguage(option.lang);
                onClose();
              }}
              className={`flex min-h-16 w-full items-center gap-3 rounded-3xl bg-card px-5 py-3 text-left text-ink active:opacity-80 ${
                on ? 'outline outline-2 outline-ink' : ''
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold">{option.label}</span>
                <span className="block text-[12.5px] font-medium text-mute">{option.other}</span>
              </span>
              {on && (
                <span className="grid size-6 place-items-center rounded-full bg-cta text-cta-fg">
                  <Icon name="check" size={14} strokeWidth={2.4} />
                  <span className="sr-only">{t.ui.selected}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
};

export default LanguageSheet;
