import React, { useRef } from 'react';
import { PiggyMark } from './PiggyMark';

/** When the animation first started, so a second Splash on screen carries on rather than replaying. */
let startedAt: number | null = null;

/**
 * The launch screen: the piggy draws itself, the name rises, and the dots after
 * the label keep pulsing until the app has what it was waiting for. It plays
 * once; moving from "starting up" to "syncing" does not restart it.
 */
export const Splash: React.FC<{ label: string }> = ({ label }) => {
  const elapsed = useRef<number | null>(null);
  if (elapsed.current === null) {
    const now = Date.now();
    if (startedAt === null) startedAt = now;
    // Past the 3 s the animation lasts, it is simply the finished picture.
    elapsed.current = Math.min((now - startedAt) / 1000, 3);
  }
  const el = elapsed.current;
  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-page font-figtree text-ink">
      <PiggyMark mode="draw" elapsed={el} className="w-[150px]" />
      <p className="pig-wm mt-5 text-[30px] font-extrabold leading-none tracking-[-0.035em]" style={{ '--el': `${el}s` } as React.CSSProperties}>
        SavvyPiggy
      </p>
      <p className="pig-lb absolute inset-x-0 bottom-12 text-center text-[12.5px] font-medium text-mute" style={{ '--el': `${el}s` } as React.CSSProperties}>
        {label}
        <i className="ml-[3px] inline-block size-1 rounded-full bg-mute align-middle" />
        <i className="ml-[3px] inline-block size-1 rounded-full bg-mute align-middle" />
        <i className="ml-[3px] inline-block size-1 rounded-full bg-mute align-middle" />
      </p>
    </div>
  );
};
