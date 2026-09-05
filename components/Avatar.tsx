import React from 'react';
import { useAuth } from '../contexts/AuthContext';

/** The signed-in user's photo, or their initial, as a round button. */
const Avatar: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { user } = useAuth();
  const label = user?.displayName || user?.email || 'S';

  return (
    <button
      onClick={onClick}
      aria-label="Profile"
      className="size-10 shrink-0 rounded-full overflow-hidden border-2 border-primary/40 bg-primary/10 text-primary font-black flex items-center justify-center active:scale-90 transition-transform"
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
