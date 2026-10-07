import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

/**
 * A screen that throws while rendering would otherwise unmount the whole app
 * and leave a blank page. This catches it, says so, and offers a reload or a
 * sign-out (a bad document can make the same screen crash on every launch).
 */
const CrashScreen: React.FC = () => {
  const t = useT();
  const { logout } = useAuth();
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-3 bg-page px-8 text-center font-figtree text-ink">
      <span className="grid size-14 place-items-center rounded-full bg-peach">
        <Icon name="bell" size={26} />
      </span>
      <p className="text-[17px] font-extrabold">{t.app.crashTitle}</p>
      <p className="max-w-[34ch] text-[13px] font-medium leading-relaxed text-mute">{t.app.crashBody}</p>
      <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
        <Button onClick={() => window.location.reload()}>{t.app.reload}</Button>
        <Button variant="ghost" onClick={() => void logout().catch(() => undefined).then(() => window.location.reload())}>
          {t.app.signOutShort}
        </Button>
      </div>
    </div>
  );
};

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    // Nothing leaves the device; this only helps when the phone is plugged in.
    console.error('Screen crashed', error instanceof Error ? error.message : error);
  }

  render() {
    return this.state.crashed ? <CrashScreen /> : this.props.children;
  }
}
