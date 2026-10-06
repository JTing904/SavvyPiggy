import React from 'react';
import { useT } from '../../contexts/LanguageContext';

/** Primary is always the ink fill; colour is reserved for what the action means. */
export type ButtonVariant = 'primary' | 'danger' | 'invest' | 'ghost';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-cta text-cta-fg',
  danger: 'bg-neg text-cta-fg',
  invest: 'bg-info text-cta-fg',
  ghost: 'bg-card text-ink',
};

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Full width (the default) or hugging its label. */
  full?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading = false,
  full = true,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}) => {
  const t = useT();
  const off = disabled || loading;
  return (
    <button
      {...rest}
      type={type}
      disabled={off}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 font-figtree text-[15.5px] font-extrabold ${
        VARIANT[variant]
      } ${full ? 'w-full' : ''} ${off ? 'opacity-40' : 'active:opacity-80'} ${className ?? ''}`}
    >
      {loading && (
        <span
          role="status"
          aria-label={t.ui.loading}
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      )}
      {children}
    </button>
  );
};
