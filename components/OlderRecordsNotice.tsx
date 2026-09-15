import React from 'react';
import { useT } from '../contexts/LanguageContext';

/**
 * Shown in place of figures that need older records not read yet. A total
 * summed from part of the ledger would look exactly like a real one, so
 * nothing is shown until everything it covers is here — and when it cannot be
 * read (usually no connection) it says so instead of guessing.
 */
const OlderRecordsNotice: React.FC<{
  status: 'loading' | 'failed';
  onRetry: () => void;
  className?: string;
}> = ({ status, onRetry, className = '' }) => {
  const t = useT();
  const loading = status === 'loading';
  return (
    <div
      role="status"
      className={`rounded-[2rem] border px-5 py-4 flex items-start gap-3 ${
        loading ? 'bg-white/5 border-white/10' : 'bg-amber-500/10 border-amber-500/30'
      } ${className}`}
    >
      <span
        className={`material-symbols-rounded text-lg shrink-0 ${loading ? 'text-primary animate-spin' : 'text-amber-300'}`}
      >
        {loading ? 'progress_activity' : 'cloud_off'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-black ${loading ? 'text-slate-300' : 'text-amber-200'}`}>
          {loading ? t.common.older.loading : t.common.older.failed}
        </p>
        {!loading && (
          <button onClick={onRetry} className="mt-2 text-[11px] font-black text-primary uppercase active:opacity-60">
            {t.common.older.retry}
          </button>
        )}
      </div>
    </div>
  );
};

/** The same, as a sheet: for something that cannot open until the records are here. */
export const OlderRecordsSheet: React.FC<{
  status: 'loading' | 'failed';
  onRetry: () => void;
  onClose: () => void;
}> = ({ status, onRetry, onClose }) => {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 veil-in" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb"
        onClick={(e) => e.stopPropagation()}
      >
        <OlderRecordsNotice status={status} onRetry={onRetry} />
        <button
          onClick={onClose}
          className="w-full mt-4 h-12 rounded-2xl glass text-slate-300 font-black active:scale-95 transition-transform"
        >
          {t.common.close}
        </button>
      </div>
    </div>
  );
};

export default OlderRecordsNotice;
