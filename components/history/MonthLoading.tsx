import React from 'react';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { useT } from '../../contexts/LanguageContext';

/**
 * What History shows in place of a month that has to be read first, and while
 * that read is under way or has failed. The same promise as OlderRecordsNotice:
 * never a month that looks empty only because its records are not here yet.
 */
export const MonthLoading: React.FC<{
  status: 'loading' | 'failed';
  /** "June 2026". */
  month: string;
  onRetry: () => void;
}> = ({ status, month, onRetry }) => {
  const t = useT();
  const loading = status === 'loading';
  return (
    <div role="status" aria-live="polite" className="mt-4">
      {loading ? (
        <>
          <p className="text-center text-[13px] font-bold text-mute">{t.calendar.readingMonth(month)}</p>
          <div className="mx-auto mt-3 h-3.5 w-[70%] animate-pulse rounded-xl bg-line/10 motion-reduce:animate-none" aria-hidden="true" />
          <div className="mx-auto mt-2 h-3.5 w-[55%] animate-pulse rounded-xl bg-line/10 motion-reduce:animate-none" aria-hidden="true" />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-card px-5 py-5 text-center text-ink">
          <Icon name="globe" size={22} className="text-mute" />
          <p className="max-w-[34ch] text-[13px] font-semibold leading-snug text-mute">{t.calendar.needsConnection(month)}</p>
          <Button full={false} onClick={onRetry}>
            {t.calendar.retry}
          </Button>
        </div>
      )}
    </div>
  );
};
