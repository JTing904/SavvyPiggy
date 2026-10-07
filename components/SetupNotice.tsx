import React from 'react';
import { useT } from '../contexts/LanguageContext';
import { PiggyTile } from './PiggyMark';

/** Shown when .env.local has no Firebase credentials yet. */
const SetupNotice: React.FC = () => {
  const t = useT();
  return (
    <div className="flex min-h-full flex-col justify-center px-5 py-12 safe-pt safe-pb font-figtree text-ink">
      <div className="mx-auto w-full max-w-md">
        <PiggyTile size={64} />
        <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">{t.auth.setupTitle}</h1>
        <p className="mt-2 text-[14px] font-medium text-mute">
          {t.auth.setupLead}
          <span className="font-bold text-ink">FIREBASE_SETUP.md</span>
          {t.auth.setupTail}
        </p>

        <ol className="mt-6 space-y-2.5">
          {t.auth.setupSteps.map((step, i) => (
            <li key={step} className="flex items-start gap-4 rounded-3xl bg-card p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-[12px] font-extrabold">{i + 1}</span>
              <p className="text-[13.5px] font-medium leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default SetupNotice;
