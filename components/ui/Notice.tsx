import React from 'react';
import { useT } from '../../contexts/LanguageContext';
import { Icon } from './Icon';

/**
 * Shown in place of figures that need older records not read yet, in the new
 * look. A total summed from part of the ledger looks exactly like a real one,
 * so nothing is shown until everything it covers is here.
 */
export const Notice: React.FC<{ status: 'loading' | 'failed'; onRetry: () => void; className?: string }> = ({ status, onRetry, className }) => {
  const t = useT();
  const loading = status === 'loading';
  return (
    <div role="status" className={`flex items-start gap-3 rounded-3xl px-5 py-4 text-ink ${loading ? 'bg-card' : 'bg-sun'} ${className ?? ''}`}>
      <span className={`mt-0.5 ${loading ? 'animate-pulse motion-reduce:animate-none' : ''}`}>
        <Icon name={loading ? 'hist' : 'bell'} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold leading-snug">{loading ? t.common.older.loading : t.common.older.failed}</p>
        {!loading && (
          <button type="button" onClick={onRetry} className="mt-2 min-h-11 text-[13px] font-extrabold underline">
            {t.common.older.retry}
          </button>
        )}
      </div>
    </div>
  );
};
