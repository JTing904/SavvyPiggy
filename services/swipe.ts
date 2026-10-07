/**
 * A horizontal swipe on the home pages switches between saving and investing.
 * It must not fire for a touch that began inside a sheet (those are rendered
 * under the page in the React tree, so their touches bubble up to it) or on a
 * row that scrolls sideways, such as a chip rail.
 */
export const swipeBlockedAt = (target: EventTarget | null): boolean => {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest('[role="dialog"]')) return true;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const x = getComputedStyle(node).overflowX;
    if ((x === 'auto' || x === 'scroll') && node.scrollWidth > node.clientWidth) return true;
  }
  return false;
};
