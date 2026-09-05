import React, { useState } from 'react';
import { SORT_OPTIONS, dirLabel, type SortOrder } from '../services/sorting';

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
        onClick={() => setOpen(true)}
        aria-label={`Sort: ${active.label}`}
        className={`shrink-0 h-8 rounded-full glass flex items-center gap-1 text-slate-300 text-xs font-bold active:scale-95 transition-transform ${
          compact ? 'px-2' : 'pl-3 pr-2'
        }`}
      >
        <span className="material-symbols-rounded text-base">swap_vert</span>
        {!compact && <span className="truncate max-w-[6rem]">{active.label}</span>}
        <span className="material-symbols-rounded text-base text-slate-500">
          {order.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-7 pt-7 pb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-white text-2xl font-black">Sort by</h3>
                <p className="text-slate-500 text-xs font-medium mt-0.5">Tap again to flip the order</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="px-5 pb-8 safe-pb space-y-2">
              {SORT_OPTIONS.map((opt) => {
                const selected = opt.key === order.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => pick(opt.key)}
                    className={`w-full flex items-center gap-4 px-5 h-16 rounded-2xl transition-colors text-left ${
                      selected ? 'bg-primary/10 border border-primary/30' : 'bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className={`material-symbols-rounded ${selected ? 'text-primary' : 'text-slate-500'}`}>
                      {opt.icon}
                    </span>
                    <span className={`flex-1 font-bold ${selected ? 'text-white' : 'text-slate-300'}`}>{opt.label}</span>
                    {selected && (
                      <span className="flex items-center gap-1 text-primary text-xs font-black">
                        {dirLabel(opt.key, order.dir)}
                        <span className="material-symbols-rounded text-base">
                          {order.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SortMenu;
