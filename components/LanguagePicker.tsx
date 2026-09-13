import React from 'react';
import { setLang, type Lang } from '../i18n';

/**
 * The very first screen, before signing in.
 *
 * It is written in both languages at once on purpose: at this point the app
 * has no idea which of the two the person reading it can read.
 */

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'zh', label: '简体中文' },
  { lang: 'en', label: 'English' },
];

const LanguagePicker: React.FC = () => (
  <div className="min-h-screen flex flex-col justify-center px-8 py-12">
    <div className="size-16 rounded-[1.25rem] bg-primary text-black flex items-center justify-center">
      <span className="material-symbols-rounded text-4xl">savings</span>
    </div>
    <h1 className="text-white text-3xl font-black tracking-tight leading-tight mt-6">
      选择语言
      <br />
      Choose your language
    </h1>
    <p className="text-slate-400 text-sm font-medium leading-relaxed mt-2">
      之后可以在 Profile 里更改。
      <br />
      You can change this later in Profile.
    </p>

    <div className="mt-8 space-y-3">
      {OPTIONS.map((option) => (
        <button
          key={option.lang}
          type="button"
          onClick={() => setLang(option.lang)}
          className="w-full h-16 px-5 rounded-2xl bg-white/5 border border-white/10 text-left text-white text-lg font-black flex items-center active:scale-[0.98] active:border-primary/50 transition-all"
        >
          <span className="flex-1">{option.label}</span>
          <span className="material-symbols-rounded text-slate-600">chevron_right</span>
        </button>
      ))}
    </div>
  </div>
);

export default LanguagePicker;
