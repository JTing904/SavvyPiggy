import React from 'react';
import { useBackHandler } from '../hooks/useBackHandler';
import type { UpdateState } from '../hooks/useUpdates';
import { sizeMb, type Release } from '../services/updates';
import { useT } from '../contexts/LanguageContext';
import { Button } from './ui/Button';
import { Bar } from './ui/Charts';
import { IconTile } from './ui/IconTile';
import { BandLabel, PageBand } from './ui/PageBand';

interface UpdatePageProps {
  release: Release;
  current: string;
  state: UpdateState;
  onInstall: () => void;
  onSkip: () => void;
  onClose: () => void;
}

/** A new version from GitHub: what changed, and getting it from inside the app. */
const UpdatePage: React.FC<UpdatePageProps> = ({ release, current, state, onInstall, onSkip, onClose }) => {
  const t = useT();
  const p = t.pro.update;
  useBackHandler(true, onClose);
  const downloading = state.step === 'downloading';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-page font-figtree text-ink no-scrollbar">
      <div className="mx-auto flex min-h-full max-w-xl flex-col">
        <PageBand title={p.title} onClose={onClose}>
          <p className="mt-1 text-[34px] font-bold leading-[1.15] tracking-[-0.015em]">{p.version(release.version)}</p>
          <BandLabel className="mt-0.5">{release.sizeBytes > 0 ? p.currentAndSize(current, sizeMb(release.sizeBytes)) : p.current(current)}</BandLabel>
        </PageBand>

        <div className="flex flex-1 flex-col gap-2.5 px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {release.notes.length > 0 && (
            <div className="rounded-3xl bg-card px-3.5 py-3">
              <h2 className="mb-1.5 text-[15px] font-bold">{p.whatsNew}</h2>
              {release.notes.map((line, i) => (
                <p key={i} className="text-[14px] font-medium leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          )}

          {downloading && (
            <div className="rounded-3xl bg-card px-3.5 py-3">
              <div className="flex justify-between text-[13.5px] font-bold tabular-nums">
                <span>{p.downloading}</span>
                <span>{state.percent}%</span>
              </div>
              <Bar percent={state.percent} height={10} className="mt-2" />
              <p className="mt-2 text-[12.5px] font-semibold tabular-nums text-mute">
                {p.progress(sizeMb(state.doneBytes), sizeMb(state.totalBytes))}
              </p>
            </div>
          )}
          {state.step === 'needsPermission' && <p className="rounded-3xl bg-sun px-4 py-3 text-[13px] font-semibold leading-snug">{p.needsPermission}</p>}
          {state.step === 'failed' && (
            <p role="alert" className="rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
              {p.failed}
            </p>
          )}

          <div className="flex items-center gap-2.5 rounded-3xl bg-mint px-3.5 py-3">
            <IconTile icon="shield" tint="teal" size={38} className="!bg-card" />
            <span className="text-[13.5px] font-semibold leading-snug">{p.safe}</span>
          </div>

          <div className="mt-auto flex flex-col gap-1">
            <Button loading={downloading} onClick={onInstall}>
              {state.step === 'failed' ? p.retry : p.install}
            </Button>
            <button type="button" onClick={onSkip} disabled={downloading} className="min-h-11 text-[14.5px] font-bold text-mute active:opacity-70 disabled:opacity-40">
              {p.skip}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdatePage;
