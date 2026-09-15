/**
 * What a withdrawal was for.
 *
 * Spending used to carry nothing but a free-text note, which meant a month
 * later there was no answering "where did it go". A short fixed list is the
 * point: a dozen buckets someone will actually use beats a taxonomy nobody
 * fills in, and a fixed set can be totalled.
 *
 * The stored value is the key, never the label. Labels can be reworded or
 * translated; a ledger that recorded "食物" would break the day either changed.
 */

export interface Category {
  key: string;
  label: string;
  icon: string;
  /** Tailwind text colour, so a row reads at a glance. */
  tint: string;
}

/** The one every entry falls back to, including every entry made before this existed. */
import { m } from '../i18n';

export const UNCATEGORISED = 'other';

export const CATEGORIES: Category[] = [
  { key: 'food', label: 'Food & drink', icon: 'restaurant', tint: 'text-amber-300' },
  { key: 'groceries', label: 'Groceries', icon: 'shopping_basket', tint: 'text-lime-300' },
  { key: 'transport', label: 'Transport', icon: 'directions_car', tint: 'text-sky-300' },
  { key: 'bills', label: 'Bills', icon: 'receipt_long', tint: 'text-orange-300' },
  { key: 'shopping', label: 'Shopping', icon: 'shopping_bag', tint: 'text-pink-300' },
  { key: 'health', label: 'Health', icon: 'medical_services', tint: 'text-red-300' },
  { key: 'family', label: 'Family', icon: 'diversity_1', tint: 'text-rose-300' },
  { key: 'fun', label: 'Fun', icon: 'sports_esports', tint: 'text-violet-300' },
  { key: 'travel', label: 'Travel', icon: 'flight', tint: 'text-cyan-300' },
  { key: 'learning', label: 'Learning', icon: 'school', tint: 'text-indigo-300' },
  { key: 'gifts', label: 'Gifts', icon: 'redeem', tint: 'text-fuchsia-300' },
  { key: UNCATEGORISED, label: 'Other', icon: 'more_horiz', tint: 'text-slate-400' },
];

// The label is read in the current language each time it is shown; the
// English above is only what a key the dictionary lacks falls back to.
for (const category of CATEGORIES) {
  const english = category.label;
  Object.defineProperty(category, 'label', {
    get: () => m().common.categories[category.key] ?? english,
    enumerable: true,
  });
}

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

/**
 * The category for a stored key. Anything unrecognised — an older entry with
 * no category at all, or a key from a future version — reads as Other rather
 * than disappearing from the totals.
 */
export const categoryOf = (key: string | undefined | null): Category =>
  (key && BY_KEY.get(key)) || BY_KEY.get(UNCATEGORISED)!;
