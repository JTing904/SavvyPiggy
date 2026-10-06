import React, { useEffect, useMemo, useState } from 'react';
import type { PiggyBank } from '../types';
import { GOAL_NAME_MAX, planBankEdit, type BankEdit } from '../services/bankEdit';
import { GOAL_ICON_SET } from '../services/goalIcons';
import { bankEditProblemText } from '../services/problemText';
import { buildBankEdit, clipName, formOfBank, isEmptyEdit, targetMissing } from '../services/goalEditForm';
import { useT } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { Sheet } from './ui/Sheet';
import { Field } from './ui/Field';
import { Keypad } from './ui/Keypad';
import { Toggle } from './ui/Toggle';
import { Button } from './ui/Button';
import { GoalIconRow } from './GoalIconPicker';

const NAME_ID = 'goal-edit-name';

/**
 * Changes a goal's name, target and icon. The balance is not here on purpose:
 * only entries in History move money. Save sends just what changed.
 */
const EditGoalSheet: React.FC<{
  bank: PiggyBank;
  onSave: (edit: BankEdit) => Promise<void>;
  onClose: () => void;
}> = ({ bank, onSave, onClose }) => {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState(() => formOfBank(bank));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = useMemo(() => buildBankEdit(bank, form), [bank, form]);
  const plan = useMemo(() => planBankEdit(bank, edit, GOAL_ICON_SET), [bank, edit]);
  const problem = 'problem' in plan ? plan.problem : null;
  const nameProblem = problem === 'nameEmpty' || problem === 'nameTooLong' ? bankEditProblemText(problem, t) : undefined;
  const otherProblem = problem && !nameProblem ? bankEditProblemText(problem, t) : null;
  const missing = targetMissing(form);
  const belowBalance = 'patch' in plan && plan.belowBalance;
  const canSave = !busy && !problem && !missing && !isEmptyEdit(edit);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(edit);
      toast.show({ message: t.goalEdit.saved, tone: 'success' });
      onClose();
    } catch (e) {
      setError((e as Error).message || t.goalEdit.couldNotSave);
      setBusy(false);
    }
  };

  // The sheet focuses its own panel when it opens; this runs after that, so the name wins.
  useEffect(() => {
    document.getElementById(NAME_ID)?.focus();
  }, []);

  const set = (patch: Partial<typeof form>) => {
    setError(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  return (
    <Sheet
      title={t.goalEdit.editTitle}
      onClose={onClose}
      height="tall"
      dismissible={!busy}
      footer={
        <div>
          {error && (
            <p role="alert" className="mb-2 px-1 text-center text-[13px] font-bold text-neg">
              {error}
            </p>
          )}
          <Button onClick={() => void save()} disabled={!canSave} loading={busy}>
            {busy ? t.goalEdit.saving : t.goalEdit.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        <Field
          label={t.goalEdit.nameLabel}
          value={form.name}
          onChange={(name) => set({ name: clipName(name) })}
          maxLength={GOAL_NAME_MAX}
          id={NAME_ID}
          autoComplete="off"
          placeholder={t.goalEdit.namePlaceholder}
          error={nameProblem}
        />

        <section aria-label={t.goalEdit.targetLabel}>
          <div className="flex min-h-11 items-center justify-between gap-3 px-1">
            <h3 className="text-[13px] font-bold text-mute">{t.goalEdit.targetLabel}</h3>
            <div className="flex items-center gap-1">
              <span className="text-[13px] font-bold text-ink" aria-hidden="true">
                {t.goalEdit.noLimit}
              </span>
              <Toggle checked={form.noLimit} onChange={(noLimit) => set({ noLimit })} label={t.goalEdit.noLimit} />
            </div>
          </div>
          {form.noLimit ? (
            <p className="rounded-3xl bg-card px-4 py-5 text-center text-[13px] font-semibold text-mute">
              {t.goalEdit.noLimitHint}
            </p>
          ) : (
            <Keypad value={form.targetText} onChange={(targetText) => set({ targetText })} />
          )}
          {missing && <p className="mt-2 px-1 text-xs font-semibold text-mute">{t.goalEdit.targetMissing}</p>}
          {otherProblem && <p className="mt-2 px-1 text-xs font-semibold text-neg">{otherProblem}</p>}
          {belowBalance && <p className="mt-2 px-1 text-xs font-semibold text-mute">{t.goalEdit.countsAsFull}</p>}
        </section>

        <section aria-label={t.goalEdit.iconLabel}>
          <h3 className="mb-2 px-1 text-[13px] font-bold text-mute">{t.goalEdit.iconLabel}</h3>
          <GoalIconRow value={form.icon} onChange={(icon) => set({ icon })} />
        </section>
      </div>
    </Sheet>
  );
};

export default EditGoalSheet;
