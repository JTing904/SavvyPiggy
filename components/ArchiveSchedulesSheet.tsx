import { safeGoalIcon } from '../services/goalIcons';
import React, { useState } from 'react';
import type { PiggyBank } from '../types';
import { archiveStrategy, isArchived, isInSplit } from '../services/ledger';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';
import { useT } from '../contexts/LanguageContext';
import { ChoiceRow } from './invest/RefundSheet';

/**
 * Asked before archiving a goal that auto deposits save straight into. An
 * archived goal takes no new money, so those rules have to point somewhere
 * else — another goal, or auto split — and, as when deleting, the person picks.
 */
const ArchiveSchedulesSheet: React.FC<{
  bank: PiggyBank;
  banks: PiggyBank[];
  aimed: number;
  /** A goal id, or null for auto split. */
  onConfirm: (target: string | null) => void;
  onClose: () => void;
}> = ({ bank, banks, aimed, onConfirm, onClose }) => {
  const t = useT();
  const w = t.goals.archiveSchedules;
  const others = banks.filter((b) => b.id !== bank.id && !isArchived(b));
  const splitAfter = archiveStrategy(banks, bank.id).some((b) => b.id !== bank.id && isInSplit(b));
  /** undefined until picked; null is auto split. */
  const [target, setTarget] = useState<string | null | undefined>(undefined);

  return (
    <Sheet
      title={w.title(bank.name)}
      z={70}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" full={false} className="flex-1" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button full={false} className="flex-1" disabled={target === undefined} onClick={() => target !== undefined && onConfirm(target)}>
            {w.confirm}
          </Button>
        </div>
      }
    >
      <p className="px-1 text-[13.5px] font-medium leading-relaxed text-mute">{t.goals.moveMoney.schedules(aimed, bank.name)}</p>

      <div className="mt-4 space-y-2">
        {others.map((b) => (
          <ChoiceRow key={b.id} icon={safeGoalIcon(b.icon)} label={b.name} on={target === b.id} onClick={() => setTarget(b.id)} />
        ))}
        <ChoiceRow
          icon="call_split"
          tone="split"
          label={t.common.autoSplit}
          sub={splitAfter ? t.goals.moveMoney.scheduleSplitSub : t.goals.moveMoney.scheduleSplitWaiting}
          on={target === null}
          onClick={() => setTarget(null)}
        />
      </div>
    </Sheet>
  );
};

export default ArchiveSchedulesSheet;
