import React from 'react';

/** A filter pill. Selected is the ink fill; the rest sit on the card colour. */
export const Chip: React.FC<{
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}> = ({ selected = false, onClick, children, className }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`min-h-11 whitespace-nowrap rounded-full px-4 text-[13px] font-bold ${
      selected ? 'bg-cta text-cta-fg' : 'bg-card text-mute'
    } ${className ?? ''}`}
  >
    {children}
  </button>
);
