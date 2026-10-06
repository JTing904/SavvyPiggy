import React from 'react';
import { useT } from '../contexts/LanguageContext';
import { FIRST_RUN_GOALS } from '../services/goalEditForm';
import { Icon } from './ui/Icon';
import { Tile, type TileTint } from './ui/Tile';

/**
 * What a new account sees instead of an empty Home: one friendly step. A
 * suggestion opens the create-goal sheet with its name and icon filled in;
 * "My own" opens it blank.
 */
const FirstRun: React.FC<{
  onCreateGoal: (prefill?: { name: string; icon: string }) => void;
  onSeedSamples: () => void;
}> = ({ onCreateGoal, onSeedSamples }) => {
  const t = useT();

  return (
    <div className="flex min-h-full flex-col bg-page px-5 pb-40 pt-10 font-figtree text-ink safe-pt">
      <div className="mx-auto w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          {/* The one pink thing in the app is the piggy. */}
          <span className="material-symbols-rounded text-[#E8456B]" style={{ fontSize: 56 }} aria-hidden="true">
            savings
          </span>
          <h1 className="mt-4 text-[30px] font-extrabold leading-tight tracking-[-0.035em]">{t.firstRun.title}</h1>
          <p className="mt-2 max-w-[32ch] text-[14px] font-medium leading-relaxed text-mute">{t.firstRun.body}</p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          {FIRST_RUN_GOALS.map((g) => {
            const name = t.firstRun.goals[g.key];
            return (
              <Tile
                key={g.key}
                tint={g.tint as TileTint}
                onClick={() => onCreateGoal(g.icon ? { name, icon: g.icon } : undefined)}
              >
                <div className="flex min-h-[88px] flex-col justify-between">
                <span className="grid size-10 place-items-center rounded-full bg-card/70" aria-hidden="true">
                  {g.icon ? (
                    <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
                      {g.icon}
                    </span>
                  ) : (
                    <Icon name="plus" size={20} />
                  )}
                </span>
                <span className="mt-3 block text-[15px] font-extrabold leading-snug">{name}</span>
                </div>
              </Tile>
            );
          })}
        </div>

        <p className="mt-5 px-1 text-center text-[12.5px] font-medium leading-relaxed text-mute">{t.firstRun.onlyGoalNote}</p>

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onSeedSamples}
            className="min-h-11 rounded-full px-4 text-[13.5px] font-bold text-mute underline underline-offset-4 active:opacity-70"
          >
            {t.firstRun.samples}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FirstRun;
