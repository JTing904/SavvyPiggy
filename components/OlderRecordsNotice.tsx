import React from 'react';
import { useT } from '../contexts/LanguageContext';
import { Button } from './ui/Button';
import { Notice } from './ui/Notice';
import { Sheet } from './ui/Sheet';

/**
 * Shown in place of figures that need older records not read yet. A total
 * summed from part of the ledger would look exactly like a real one, so
 * nothing is shown until everything it covers is here, and when it cannot be
 * read (usually no connection) it says so instead of guessing.
 */
const OlderRecordsNotice: React.FC<{
  status: 'loading' | 'failed';
  onRetry: () => void;
  className?: string;
}> = ({ status, onRetry, className }) => <Notice status={status} onRetry={onRetry} className={className} />;

/** The same, as a sheet: for something that cannot open until the records are here. */
export const OlderRecordsSheet: React.FC<{
  status: 'loading' | 'failed';
  onRetry: () => void;
  onClose: () => void;
}> = ({ status, onRetry, onClose }) => {
  const t = useT();
  return (
    <Sheet onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>{t.common.close}</Button>}>
      <Notice status={status} onRetry={onRetry} />
    </Sheet>
  );
};

export default OlderRecordsNotice;
