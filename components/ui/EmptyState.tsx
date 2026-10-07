import React from 'react';
import { useT } from '../../contexts/LanguageContext';
import { Icon } from './Icon';
import { Button } from './Button';

/** Says what is missing and, when there is one, the one thing to do about it. */
export const EmptyState: React.FC<{
  icon?: string;
  title?: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}> = ({ icon = 'spark', title, body, action, className }) => {
  const t = useT();
  return (
    <div className={`flex flex-col items-center px-6 py-10 text-center text-ink ${className ?? ''}`}>
      <span className="mb-4 grid size-14 place-items-center rounded-full bg-mint">
        <Icon name={icon} size={26} />
      </span>
      <p className="text-[17px] font-extrabold">{title ?? t.ui.emptyTitle}</p>
      <p className="mt-1.5 max-w-[30ch] text-[13px] font-medium leading-relaxed text-mute">{body ?? t.ui.emptyBody}</p>
      {action && (
        <Button full={false} onClick={action.onClick} className="mt-5">
          {action.label}
        </Button>
      )}
    </div>
  );
};
