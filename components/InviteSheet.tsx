import React, { useEffect, useRef, useState } from 'react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';
import { mintInvite, subscribeToInviteUse } from '../services/invites';
import { formatLeft, msLeft, shareLeft } from '../services/inviteCodes';
import { QrCode } from './QrCode';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';

/**
 * The admin's sheet: one tap makes a code that works once, for ten minutes.
 * It shows the code as a QR and as text, counts down, and turns into a thank
 * you when the friend has used it.
 */
type State =
  | { kind: 'idle' }
  | { kind: 'making' }
  | { kind: 'live'; code: string; expiresAt: number }
  | { kind: 'used' };

const InviteSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  // The countdown only runs while there is a live code.
  useEffect(() => {
    if (state.kind !== 'live') return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.kind === 'live' ? state.code : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Know when the friend has used it.
  useEffect(() => {
    if (state.kind !== 'live') return;
    return subscribeToInviteUse(state.code, () => alive.current && setState({ kind: 'used' }));
  }, [state.kind === 'live' ? state.code : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const make = async () => {
    if (!user || state.kind === 'making') return;
    setError(null);
    setCopied(false);
    setState({ kind: 'making' });
    try {
      const { code, expiresAt } = await mintInvite(user.uid);
      if (alive.current) setState({ kind: 'live', code, expiresAt });
    } catch {
      if (alive.current) {
        setError(t.invite.failed);
        setState({ kind: 'idle' });
      }
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => alive.current && setCopied(false), 2000);
    } catch {
      // Clipboard can be refused; the code is on screen to read out instead.
    }
  };

  const share = async (code: string) => {
    const text = t.invite.shareText(code);
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch {
      // Closing the share sheet is not an error.
    }
  };

  const left = state.kind === 'live' ? msLeft(state.expiresAt, now) : 0;
  const expired = state.kind === 'live' && left <= 0;

  return (
    <Sheet onClose={onClose} title={t.invite.title}>
      {(state.kind === 'idle' || state.kind === 'making') && (
        <div className="flex flex-col items-center pb-2 text-center">
          <p className="text-[13.5px] font-semibold leading-relaxed text-mute">{t.invite.idleIntro}</p>
          <span className="my-5 grid size-28 place-items-center rounded-[30px] bg-mint text-pos">
            <Icon name="userplus" size={52} />
          </span>
          {error && (
            <p role="alert" className="mb-3 w-full rounded-2xl bg-peach px-4 py-3 text-[13px] font-bold text-neg">
              {error}
            </p>
          )}
          <Button loading={state.kind === 'making'} onClick={() => void make()}>
            {state.kind === 'making' ? t.invite.making : t.invite.generate}
          </Button>
          <p className="mt-3 text-[12px] font-semibold text-mute">{t.invite.replaceNote}</p>
        </div>
      )}

      {state.kind === 'live' && (
        <div className="flex flex-col items-center pb-2 text-center">
          <p className="text-[13.5px] font-semibold leading-relaxed text-mute">
            {expired ? t.invite.expiredIntro : t.invite.liveIntro}
          </p>
          <div className="my-4">
            <QrCode value={state.code} dim={expired} label={t.invite.qrLabel} />
          </div>
          <p
            className={`select-all font-mono text-[19px] font-extrabold tracking-[0.06em] tabular-nums ${
              expired ? 'text-mute line-through' : 'text-ink'
            }`}
          >
            {state.code}
          </p>
          {expired ? (
            <p className="mb-4 mt-2 text-[14px] font-extrabold text-neg">{t.invite.expired}</p>
          ) : (
            <div className="mb-4 mt-2 flex items-center gap-2.5 text-[14px] font-extrabold">
              <span className="text-pos">{t.invite.timeLeft(formatLeft(left))}</span>
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-line/10" aria-hidden="true">
                <span className="block h-full rounded-full bg-pos" style={{ width: `${shareLeft(left) * 100}%` }} />
              </span>
            </div>
          )}
          {expired ? (
            <Button onClick={() => void make()}>{t.invite.makeNew}</Button>
          ) : (
            <>
              <div className="grid w-full grid-cols-2 gap-2.5">
                <Button variant="ghost" onClick={() => void copy(state.code)}>
                  {copied ? t.invite.copied : t.invite.copy}
                </Button>
                <Button variant="ghost" onClick={() => void share(state.code)}>
                  {t.invite.share}
                </Button>
              </div>
              <p className="mt-3 text-[12px] font-semibold text-mute">{t.invite.liveNote}</p>
            </>
          )}
        </div>
      )}

      {state.kind === 'used' && (
        <div className="flex flex-col items-center pb-2 text-center">
          <p className="text-[13.5px] font-semibold text-mute">{t.invite.usedIntro}</p>
          <div className="my-4 w-full rounded-3xl bg-mint px-5 py-6">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-card text-pos">
              <Icon name="check" size={26} />
            </span>
            <p className="mt-3 text-[17px] font-extrabold">{t.invite.usedTitle}</p>
            <p className="mt-1 text-[13px] font-semibold text-mute">{t.invite.usedBody}</p>
          </div>
          <Button onClick={() => void make()}>{t.invite.makeAnother}</Button>
        </div>
      )}
    </Sheet>
  );
};

export default InviteSheet;
