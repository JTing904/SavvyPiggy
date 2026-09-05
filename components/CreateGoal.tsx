
import React, { useEffect, useRef, useState } from 'react';
import { PiggyBank } from '../types';
import { uploadGoalImage } from '../services/storage';
import { compressImage } from '../services/image';
import { isStorageEnabled } from '../lib/firebase';

interface CreateGoalProps {
  uid: string;
  onCancel: () => void;
  onCreate: (goal: Partial<PiggyBank>) => Promise<void> | void;
}

const ICONS = ['directions_car', 'flight', 'home', 'shopping_bag', 'restaurant', 'devices', 'pets', 'fitness_center', 'movie', 'Celebration', 'School', 'Medical_Services'];

const CATEGORIES: Record<string, string> = {
  directions_car: 'Transport',
  flight: 'Travel',
  home: 'Home',
  shopping_bag: 'Shopping',
  restaurant: 'Food',
  devices: 'Tech',
  pets: 'Pets',
  fitness_center: 'Health',
  movie: 'Fun',
  Celebration: 'Fun',
  School: 'Education',
  Medical_Services: 'Health',
};

const CreateGoal: React.FC<CreateGoalProps> = ({ uid, onCancel, onCreate }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(ICONS[2]); // Default to 'home'
  const [autoSplit, setAutoSplit] = useState(true);
  const [noTarget, setNoTarget] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  // An open-ended goal needs no amount, so it is stored as a target of 0.
  const canSubmit = Boolean(name) && (noTarget || Boolean(amount));

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Without Cloud Storage the shrunken photo rides along inside the
      // Firestore document, which the free plan allows.
      const imageUrl = file
        ? isStorageEnabled
          ? await uploadGoalImage(uid, file)
          : await compressImage(file)
        : undefined;
      await onCreate({
        name,
        targetAmount: noTarget ? 0 : parseFloat(amount),
        icon: selectedIcon,
        imageUrl,
        autoSplit,
      });
    } catch (e) {
      setError((e as Error).message || 'Could not create this goal.');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-dark safe-pt">
      {/* Header */}
      <div className="flex items-center px-6 py-4 justify-between sticky top-0 bg-bg-dark/80 backdrop-blur-md z-20">
        <button
          className="size-10 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
          onClick={onCancel}
        >
          <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
        </button>
        <h2 className="text-white text-lg font-bold tracking-tight">New Piggy Bank</h2>
        <div className="size-10"></div> {/* Spacer for alignment */}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4">
        <div className="mb-8">
          <h1 className="text-white text-4xl font-black tracking-tight mb-2">Create Goal</h1>
          <p className="text-slate-500 font-medium">What are you saving up for?</p>
        </div>

        <div className="space-y-8">
          {/* Cover Image */}
          <div className="space-y-3">
            <label className="text-slate-500 text-xs font-black uppercase tracking-widest ml-1">Cover Image</label>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                setError(null);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
            <button
              onClick={() => fileInput.current?.click()}
              className="w-full aspect-[16/9] rounded-3xl bg-surface border-2 border-dashed border-white/10 overflow-hidden relative flex flex-col items-center justify-center gap-2 text-slate-600 active:scale-[0.98] transition-transform"
            >
              {preview ? (
                <>
                  <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
                  <div className="absolute inset-0 bg-black/40"></div>
                  <span className="material-symbols-rounded text-white text-3xl relative">edit</span>
                  <span className="text-white text-xs font-bold relative">Change image</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-rounded text-3xl">add_photo_alternate</span>
                  <span className="text-xs font-bold">Optional &mdash; tap to upload</span>
                </>
              )}
            </button>
          </div>

          {/* Goal Name Input */}
          <div className="space-y-3">
            <label className="text-slate-500 text-xs font-black uppercase tracking-widest ml-1">Goal Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-16 px-6 rounded-3xl bg-surface border border-white/5 text-xl font-bold focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-700 text-white shadow-xl"
              placeholder="e.g. Dream Wedding"
              type="text"
            />
          </div>

          {/* Target Amount Input */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1 gap-3">
              <label className="text-slate-500 text-xs font-black uppercase tracking-widest">Target Amount</label>
              <button
                onClick={() => setNoTarget((on) => !on)}
                className={`shrink-0 px-3 h-8 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                  noTarget ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'
                }`}
              >
                No limit
              </button>
            </div>
            {noTarget ? (
              <div className="w-full h-20 px-6 rounded-3xl bg-surface border border-white/5 flex items-center gap-4 shadow-xl">
                <span className="text-primary text-4xl font-black leading-none">&infin;</span>
                <p className="text-slate-500 text-xs font-medium leading-relaxed">
                  Open-ended &mdash; keep saving with no finish line.
                </p>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-600">$</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-20 pl-12 pr-6 rounded-3xl bg-surface border border-white/5 text-3xl font-black focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-700 text-white shadow-xl"
                  placeholder="0.00"
                  type="number"
                />
              </div>
            )}
          </div>

          {/* Icon Selection */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <label className="text-slate-500 text-xs font-black uppercase tracking-widest">Select Icon</label>
              <span className="text-primary text-[10px] font-black uppercase tracking-widest">
                Category: {CATEGORIES[selectedIcon] ?? 'Other'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-4 pb-2">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setSelectedIcon(icon)}
                  className={`flex items-center justify-center aspect-square rounded-[2rem] border-2 transition-all duration-300 ${
                    selectedIcon === icon
                    ? 'bg-primary border-primary text-black shadow-lg shadow-primary/20 scale-105'
                    : 'bg-surface border-white/5 text-slate-500 hover:border-white/10'
                  }`}
                >
                  <span className="material-symbols-rounded text-3xl font-medium">{icon}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-2xl bg-red-500/10 border border-red-500/20 px-5 py-4">
              <span className="material-symbols-rounded text-red-400 text-lg">error</span>
              <p className="text-red-300 text-xs font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {/* Automatic Split */}
          <button
            onClick={() => setAutoSplit((on) => !on)}
            className="w-full bg-surface rounded-3xl p-6 border border-white/5 flex items-center justify-between gap-4 shadow-xl text-left"
          >
            <div className="flex flex-col gap-1 min-w-0">
              <p className="font-bold text-white text-base">Automatic Split</p>
              <p className="text-xs text-slate-500 font-medium">
                {autoSplit
                  ? 'This goal takes a share of every deposit'
                  : 'This goal is skipped when a deposit is split'}
              </p>
            </div>
            <div
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
                autoSplit ? 'bg-primary/20' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full transition-transform ${
                  autoSplit
                    ? 'translate-x-7 bg-primary shadow-lg shadow-primary/30'
                    : 'translate-x-1 bg-slate-600'
                }`}
              ></span>
            </div>
          </button>

          <p className="text-slate-600 text-xs font-medium leading-relaxed px-1">
            New goals start at a 0% split. Set their share of each deposit on the Strategy tab.
          </p>
        </div>
      </div>

      {/* Footer Action */}
      <div className="p-6 pb-12 safe-pb">
        <button
          onClick={() => void handleSubmit()}
          disabled={!canSubmit || busy}
          className={`w-full h-18 py-5 rounded-[2rem] font-black text-xl transition-all shadow-2xl ${
            canSubmit && !busy
            ? 'bg-primary text-black shadow-primary/20 active:scale-95'
            : 'bg-white/5 text-slate-700 cursor-not-allowed'
          }`}
        >
          {busy ? 'Saving...' : 'Confirm Goal'}
        </button>
      </div>
    </div>
  );
};

export default CreateGoal;
