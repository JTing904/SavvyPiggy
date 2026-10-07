import React from 'react';

/** A white rounded block whose children are separated by hairlines (use Row, or any elements). */
export const Group: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`divide-y divide-line/10 rounded-3xl bg-card px-4 py-1 text-ink ${className ?? ''}`}>{children}</div>
);
