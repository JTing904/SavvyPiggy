import React, { useEffect, useRef, useState } from 'react';
import { PiggyBank } from '../types';
import { uploadGoalImage } from '../services/storage';
import { compressImage } from '../services/image';
import { isStorageEnabled } from '../lib/firebase';
import { GOAL_NAME_MAX } from '../services/bankEdit';
import { canCreateGoal, clipName, iconForNewGoal, newGoalOf, targetMissing } from '../services/goalEditForm';
import { amountToCents } from '../services/keypad';
import { formatMoney, fromCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { IconTile } from './ui/IconTile';
import { Keypad } from './ui/Keypad';
import { PageBand } from './ui/PageBand';
import { PageSheet } from './ui/PageSheet';
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
  /** The target's keys, folded away until the row is tapped: the name comes first. */
  const [keysOpen, setKeysOpen] = useState(false);
  const [autoSplit, setAutoSplit] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const icon = iconForNewGoal(name, pickedIcon);
  const form = { name, targetText, noLimit, icon };
  const canSubmit = canCreateGoal(form);

  // The name comes first, so the page opens ready to type it.
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
    <PageSheet
      band={<PageBand title={t.goalEdit.createTitle} onClose={() => !busy && onCancel()} />}
      onClose={onCancel}
      dismissible={!busy}
      footer={
        <>
          {error && (
            <p role="alert" className="mb-2 px-1 text-center text-[13px] font-bold text-neg">
              {error}
            </p>
          )}
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit} loading={busy}>
            {busy ? t.goals.saving : t.goalEdit.createCta}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-3xl bg-card px-3.5 py-3">
        <IconTile icon={<span className="material-symbols-rounded text-[28px] leading-none">{icon}</span>} tint="teal" size={56} />
        <label className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-mute">{t.goalEdit.nameLabel}</span>
          <input
            id={NAME_ID}
            value={name}
            onChange={(e) => {
              setError(null);
              setName(clipName(e.target.value));
            }}
            maxLength={GOAL_NAME_MAX}
            autoComplete="off"
            placeholder={t.goalEdit.namePlaceholder}
            className="mt-0.5 min-h-7 w-full min-w-0 select-text border-0 bg-transparent p-0 font-figtree text-[18px] font-bold text-ink placeholder:text-mute focus:ring-0"
          />
        </label>
      </div>

      <section aria-label={t.goalEdit.iconLabel} className="rounded-3xl bg-card px-3.5 py-3">
        <h2 className="mb-2 text-[15px] font-bold">{t.goalEdit.iconLabel}</h2>
        <GoalIconRow value={icon} onChange={setPickedIcon} onCard />
      </section>

      <Group>
        <Row
          icon="target"
          tint="sun"
          title={t.goalEdit.targetLabel}
          trailing={noLimit ? t.goalEdit.noLimit : formatMoney(fromCents(amountToCents(targetText)))}
          tone={noLimit ? 'mute' : targetText === '' ? 'info' : 'ink'}
          onClick={noLimit ? undefined : () => setKeysOpen((open) => !open)}
        />
        <Row icon="repeat" tint="lav" title={t.goalEdit.noLimit} sub={noLimit ? t.goalEdit.noLimitHint : undefined} trailing={<Toggle checked={noLimit} onChange={setNoLimit} label={t.goalEdit.noLimit} />} />
      </Group>
      {!noLimit && keysOpen && <Keypad value={targetText} onChange={setTargetText} compact />}
      {targetMissing(form) && <p className="px-1 text-[12.5px] font-semibold text-mute">{t.goalEdit.targetMissing}</p>}

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
      <Group>
        <Row
          icon="pie"
          tint="mint"
          title={t.goalEdit.shareOfDeposits}
          sub={autoSplit ? t.goalEdit.shareOn : t.goalEdit.shareOff}
          trailing={<Toggle checked={autoSplit} onChange={setAutoSplit} label={t.goalEdit.shareOfDeposits} />}
        />
        <Row
          icon="image"
          tint="peach"
          title={t.goalEdit.coverPhoto}
          sub={preview ? t.goalEdit.photoChange : `${t.ui.optional} · ${t.goalEdit.photoAdd}`}
          onClick={() => fileInput.current?.click()}
          trailing={preview ? <img src={preview} alt="" className="size-9 rounded-xl object-cover" /> : undefined}
        />
      </Group>

      {autoSplit && <p className="px-1 text-[12.5px] font-medium leading-relaxed text-mute">{isFirstGoal ? t.goalEdit.onlyGoal : t.goalEdit.startsAtZero}</p>}
    </PageSheet>
  );
};

export default CreateGoal;
