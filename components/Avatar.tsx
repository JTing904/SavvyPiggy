import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';

/** The signed-in user's photo, or their initial, as a round button. */
const Avatar: React.FC<{ onClick: () => void; plain?: boolean }> = ({ onClick, plain = false }) => {
  const { user } = useAuth();
  const t = useT();
  const label = user?.displayName || user?.email || 'S';

  return (
    <button
      onClick={onClick}
      aria-label={t.profile.avatarLabel}
      className={`shrink-0 overflow-hidden rounded-full font-black flex items-center justify-center active:scale-90 transition-transform ${
        plain ? 'size-11 bg-card text-ink' : 'size-10 border-2 border-primary/40 bg-primary/10 text-primary'
      }`}
    >
      {user?.photoURL ? (
        <img src={user.photoURL} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        label.charAt(0).toUpperCase()
      )}
    </button>
  );
};

export default Avatar;
