import React, { useEffect, useState } from 'react';
import * as api from '../services/firestore';
import { canReadPictures, pickReceipt } from '../services/quickRead';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';

/** Receipts already read in this session, so opening an entry twice reads them once. */
const cache = new Map<string, string>();

/** The most receipts one entry keeps. */
export const MAX_RECEIPTS = 2;

/**
 * The receipt photos of one entry: small pictures to look at, to add (taken or
 * chosen, compressed on the phone) and to remove. They are only read when this
 * is shown, so an entry costs nothing until someone looks at its receipts.
 */
const ReceiptStrip: React.FC<{ ownerId: string; ids: string[] }> = ({ ownerId, ids }) => {
  const t = useT();
  const n = t.net;
  const { user } = useAuth();
  const uid = user?.uid;
  const [, bump] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    ids.forEach((id) => {
      if (cache.has(id)) return;
      api
        .loadReceipt(uid, id)
        .then((url) => {
          cache.set(id, url);
          if (live) bump((v) => v + 1);
        })
        .catch(() => live && setFailed((f) => new Set(f).add(id)));
    });
    return () => {
      live = false;
    };
  }, [uid, ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (source: 'camera' | 'gallery') => {
    if (!uid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const image = await pickReceipt(source);
      if (image) await api.addReceipt(uid, { kind: 'activity', id: ownerId }, image);
    } catch {
      setError(n.receiptFailed);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!uid) return;
    setBusy(true);
    try {
      await api.removeReceipt(uid, { kind: 'activity', id: ownerId }, id);
      cache.delete(id);
      setViewing(null);
    } catch {
      setError(n.receiptFailed);
    } finally {
      setBusy(false);
    }
  };

  const shown = viewing ? cache.get(viewing) : undefined;

  return (
    <div>
      <div className="mb-2 mt-5 flex items-baseline justify-between px-0.5">
        <p className="text-[12.5px] font-bold text-mute">{n.receiptsTitle}</p>
        <p className="text-[11.5px] font-semibold text-mute">{n.receiptMax}</p>
      </div>

      {ids.length > 0 && (
        <div className="flex gap-2.5">
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewing(id)}
              aria-label={n.receiptsTitle}
              className="grid h-28 w-20 place-items-center overflow-hidden rounded-2xl bg-lav text-[11px] font-bold text-mute active:opacity-80"
            >
              {cache.get(id) ? (
                <img src={cache.get(id)} alt="" className="size-full object-cover" />
              ) : failed.has(id) ? (
                n.receiptLoadFailed
              ) : (
                n.receiptLoading
              )}
            </button>
          ))}
        </div>
      )}

      {ids.length < MAX_RECEIPTS && canReadPictures() && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip className="inline-flex items-center" onClick={() => void add('camera')}>
            <Icon name="camera" size={16} className="mr-1.5" />
            {n.receiptCamera}
          </Chip>
          <Chip className="inline-flex items-center" onClick={() => void add('gallery')}>
            <Icon name="image" size={16} className="mr-1.5" />
            {n.receiptGallery}
          </Chip>
        </div>
      )}
      {busy && <p className="mt-2 px-0.5 text-[12.5px] font-semibold text-mute">{n.receiptSaving}</p>}
      {error && <p className="mt-2 px-0.5 text-[12.5px] font-bold text-neg">{error}</p>}
      <p className="mt-2 px-0.5 text-[11.5px] font-medium leading-snug text-mute">{n.receiptKept}</p>

      {viewing && (
        <Sheet
          title={n.receiptsTitle}
          z={55}
          height="tall"
          onClose={() => setViewing(null)}
          footer={
            <Button variant="danger" loading={busy} onClick={() => void remove(viewing)}>
              {n.receiptRemove}
            </Button>
          }
        >
          {shown ? <img src={shown} alt="" className="w-full rounded-2xl" /> : <p className="py-10 text-center text-[13px] font-semibold text-mute">{n.receiptLoading}</p>}
        </Sheet>
      )}
    </div>
  );
};

export default ReceiptStrip;
