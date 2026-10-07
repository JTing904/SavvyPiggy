import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';
import { readBackup } from '../services/backup';
import { backupFileName, countDocs } from '../services/backupFormat';
import { saveFile } from '../services/share';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';

/**
 * "Export everything": reads the whole account once when opened, shows what
 * the file will be, and hands it to the system share sheet on request. Nothing
 * is uploaded anywhere.
 */
const BackupSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const { user } = useAuth();
  const uid = user?.uid;
  const [file, setFile] = useState<{ name: string; text: string; kb: number; docs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    const now = new Date();
    readBackup(uid, now)
      .then((backup) => {
        if (!live) return;
        const text = JSON.stringify(backup, null, 2);
        setFile({
          name: backupFileName(t.backup.fileWord, now),
          text,
          kb: Math.max(1, Math.round(new TextEncoder().encode(text).length / 1024)),
          docs: countDocs(backup),
        });
      })
      .catch(() => live && setError(t.backup.failed));
    return () => {
      live = false;
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveFile(file.name, 'application/json', file.text);
      setDone(true);
    } catch {
      // Closing the share sheet without choosing is not worth an error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={t.backup.title}>
      <p className="text-[13.5px] font-semibold leading-relaxed text-mute">{t.backup.intro}</p>

      <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-card p-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-ink">
          <Icon name="doc" size={20} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold">{file?.name ?? backupFileName(t.backup.fileWord, new Date())}</p>
          <p className="text-[12px] font-semibold text-mute">{file ? t.backup.size(file.kb, file.docs) : t.backup.preparing}</p>
        </div>
      </div>

      <p className="mt-3 px-1 text-[12px] font-semibold leading-relaxed text-mute">{t.backup.contains}</p>

      {error && (
        <p role="alert" className="mt-3 rounded-2xl bg-peach px-4 py-3 text-[13px] font-bold text-neg">
          {error}
        </p>
      )}

      <Button className="mt-4" disabled={!file} loading={busy} onClick={() => void save()}>
        {busy ? t.backup.saving : done ? t.backup.saved : t.backup.save}
      </Button>
    </Sheet>
  );
};

export default BackupSheet;
