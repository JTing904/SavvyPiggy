import React, { useState } from 'react';
import { SORT_OPTIONS, dirLabel, type SortOrder } from '../services/sorting';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';
import { useT } from '../contexts/LanguageContext';

interface SortMenuProps {
  order: SortOrder;
  onChange: (next: SortOrder) => void;
  /** Icon-only chip for headers that have no room for a label. */
  compact?: boolean;
}

/**
 * A compact chip that opens a bottom sheet of orderings. Tapping the active
 * key again flips its direction, so the common "reverse it" is one tap.
 */
const SortMenu: React.FC<SortMenuProps> = ({ order, onChange, compact = false }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const active = SORT_OPTIONS.find((o) => o.key === order.key) ?? SORT_OPTIONS[0];

  const pick = (key: SortOrder['key']) => {
    if (key === order.key) {
      onChange({ key, dir: order.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      // Money-like keys read best biggest-first; names and dates smallest-first.
      onChange({ key, dir: key === 'name' || key === 'created' ? 'asc' : 'desc' });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.history.sortAria(active.label)}
        className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-card text-[12.5px] font-bold text-ink active:opacity-70 ${compact ? 'px-3' : 'pl-3.5 pr-3'}`}
      >
        <Icon name="swap" size={16} />
        {!compact && <span className="max-w-[6rem] truncate">{active.label}</span>}
        <span className="text-mute" aria-hidden="true">
          {order.dir === 'asc' ? '↑' : '↓'}
        </span>
      </button>

      {open && (
        <Sheet title={t.history.sortBy} onClose={() => setOpen(false)}>
          <p className="-mt-1 px-1 text-[13px] font-medium text-mute">{t.history.tapToFlip}</p>
          <div className="mt-3 space-y-2">
            {SORT_OPTIONS.map((opt) => {
              const selected = opt.key === order.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => pick(opt.key)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-3xl bg-card px-4 text-left active:opacity-80 ${selected ? 'outline outline-2 outline-ink' : ''}`}
                >
                  <span className="material-symbols-rounded text-mute" style={{ fontSize: 22 }}>
                    {opt.icon}
                  </span>
                  <span className="flex-1 text-[15px] font-bold">{opt.label}</span>
                  {selected && (
                    <span className="flex items-center gap-1 text-[12.5px] font-extrabold">
                      {dirLabel(opt.key, order.dir)}
                      <span aria-hidden="true">{order.dir === 'asc' ? '↑' : '↓'}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </>
  );
};

export default SortMenu;
