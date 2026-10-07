/** Joins class names, skipping the falsy ones. Whole literal class strings only: never build `bg-${x}`. */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
