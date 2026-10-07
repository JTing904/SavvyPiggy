import React, { useEffect, useRef, useState } from 'react';
import { PiggyBank } from '../types';
import { uploadGoalImage } from '../services/storage';
import { compressImage } from '../services/image';
import { isStorageEnabled } from '../lib/firebase';
import { GOAL_NAME_MAX } from '../services/bankEdit';
import { canCreateGoal, clipName, iconForNewGoal, newGoalOf, targetMissing } from '../services/goalEditForm';
import { useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Field } from './ui/Field';
import { Keypad } from './ui/Keypad';
import { Toggle } from './ui/Toggle';
import { Group } from './ui/Group';
import { Row } from './ui/Row';
import { Button } from './ui/Button';
import { GoalIconRow } from './GoalIconPicker';

interface CreateGoalProps {
  uid: string;
  onCancel: () => void;
  onCreate: (goal: Partial<PiggyBank>) => Promise<void> | void;
  /** A name and icon to start from (the first-run suggestions). */
  prefill?: { name?: string; icon?: string };
  /** True when this will be the only goal, so it takes every deposit. */
  isFirstGoal?: boolean;
}

const NAME_ID = 'create-goal-name';

const CreateGoal: React.FC<CreateGoalProps> = ({ uid, onCancel, onCreate, prefill, isFirstGoal = false }) => {
  const t = useT();
  const [name, setName] = useState(() => clipName(prefill?.name ?? ''));
  // Until the person picks one, the icon follows what the name suggests.
  const [pickedIcon, setPickedIcon] = useState<string | null>(prefill?.icon ?? null);
  const [targetText, setTargetText] = useState('');
  const [noLimit, setNoLimit] = useState(false);
  const [autoSplit, setAutoSplit] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const icon = iconForNewGoal(name, pickedIcon);
  const form = { name, targetText, noLimit, icon };
  const canSubmit = canCreateGoal(form);

  // The sheet focuses its own panel when it opens; this runs after that, so the name wins.
  useEffect(() => {
    document.getElementById(NAME_ID)?.focus();
  }, []);

  // Revoke the object URL so the blob is not leaked when the preview changes.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Without Cloud Storage the shrunken photo rides along inside the
      // Firestore document, which the free plan allows.
      const imageUrl = file ? (isStorageEnabled ? await uploadGoalImage(uid, file) : await compressImage(file)) : undefined;
      await onCreate(newGoalOf(form, autoSplit, imageUrl));
    } catch (e) {
      setError((e as Error).message || t.goals.couldNotCreate);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t.goalEdit.createTitle}
      onClose={onCancel}
      height="tall"
      dismissible={!busy}
      footer={
        <div>
          {error && (
            <p role="alert" className="mb-2 px-1 text-center text-[13px] font-bold text-neg">
              {error}
            </p>
          )}
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit} loading={busy}>
            {busy ? t.goals.saving : t.goalEdit.createCta}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        <Field
          label={t.goalEdit.nameLabel}
          value={name}
          onChange={(v) => {
            setError(null);
            setName(clipName(v));
          }}
          id={NAME_ID}
          maxLength={GOAL_NAME_MAX}
          autoComplete="off"
          placeholder={t.goalEdit.namePlaceholder}
        />

        <section aria-label={t.goalEdit.targetLabel}>
          <div className="flex min-h-11 items-center justify-between gap-3 px-1">
            <h3 className="text-[13px] font-bold text-mute">{t.goalEdit.targetLabel}</h3>
            <div className="flex items-center gap-1">
              <span className="text-[13px] font-bold text-ink" aria-hidden="true">
                {t.goalEdit.noLimit}
              </span>
              <Toggle checked={noLimit} onChange={setNoLimit} label={t.goalEdit.noLimit} />
            </div>
          </div>
          {noLimit ? (
            <p className="rounded-3xl bg-card px-4 py-5 text-center text-[13px] font-semibold text-mute">
              {t.goalEdit.noLimitHint}
            </p>
          ) : (
            <Keypad value={targetText} onChange={setTargetText} />
          )}
          {targetMissing(form) && targetText !== '' && (
            <p className="mt-2 px-1 text-xs font-semibold text-mute">{t.goalEdit.targetMissing}</p>
          )}
        </section>

        <section aria-label={t.goalEdit.iconLabel}>
          <h3 className="mb-2 px-1 text-[13px] font-bold text-mute">{t.goalEdit.iconLabel}</h3>
          <GoalIconRow value={icon} onChange={setPickedIcon} />
        </section>

        <Group>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
              // The same photo can be chosen again after it was removed from the form.
              e.target.value = '';
            }}
          />
          <Row
            icon="image"
            tint="peach"
            title={t.goalEdit.coverPhoto}
            sub={preview ? t.goalEdit.photoChange : `${t.ui.optional} · ${t.goalEdit.photoAdd}`}
            onClick={() => fileInput.current?.click()}
            trailing={preview ? <img src={preview} alt="" className="size-9 rounded-xl object-cover" /> : undefined}
          />
          <Row
            icon="pie"
            tint="mint"
            title={t.goalEdit.shareOfDeposits}
            sub={autoSplit ? t.goalEdit.shareOn : t.goalEdit.shareOff}
            trailing={<Toggle checked={autoSplit} onChange={setAutoSplit} label={t.goalEdit.shareOfDeposits} />}
          />
        </Group>

        {autoSplit && (
          <p className="px-1 text-xs font-medium leading-relaxed text-mute">
            {isFirstGoal ? t.goalEdit.onlyGoal : t.goalEdit.startsAtZero}
          </p>
        )}
      </div>
    </Sheet>
  );
};

export default CreateGoal;
