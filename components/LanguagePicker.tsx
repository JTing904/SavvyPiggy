import React from 'react';
import { setLang, type Lang } from '../i18n';
import { PiggyTile } from './PiggyMark';
import { Icon } from './ui/Icon';

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
  <div className="flex min-h-screen flex-col justify-center bg-page px-6 py-12 font-figtree text-ink">
    <PiggyTile size={72} />
    <h1 className="mt-6 text-[30px] font-extrabold leading-tight tracking-[-0.03em]">
      选择语言
      <br />
      Choose your language
    </h1>
    <p className="mt-2 text-[14px] font-medium leading-relaxed text-mute">
      之后可以在「设置」页面里更改。
      <br />
      You can change this later in Settings.
    </p>

    <div className="mt-8 space-y-3">
      {OPTIONS.map((option) => (
        <button
          key={option.lang}
          type="button"
          onClick={() => setLang(option.lang)}
          className="flex min-h-16 w-full items-center rounded-3xl bg-card px-5 text-left text-[18px] font-extrabold active:opacity-80"
        >
          <span className="flex-1">{option.label}</span>
          <Icon name="chev" size={20} className="text-mute" />
        </button>
      ))}
    </div>
  </div>
);

export default LanguagePicker;
