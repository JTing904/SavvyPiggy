/**
 * Which look the screen on top should wear while the app moves over to the new
 * design one screen at a time. 'legacy' is the old dark neon app, which only
 * knows how to be dark; 'new' follows the user's light/dark/system choice.
 *
 * Pure, so the allowlist can be tested. When a screen is redesigned, add its
 * tab or overlay name here and nothing else has to change.
 */
export type Look = 'new' | 'legacy';

/** Tabs that have been redesigned. */
export const NEW_LOOK_TABS: readonly string[] = ['log', 'homeSave'];

/** Full-screen views and sheets that have been redesigned. */
export const NEW_LOOK_OVERLAYS: readonly string[] = ['goalDetail', 'createGoal'];

export interface ScreenState {
  /** The active tab. */
  tab: string;
  /** Open overlays, bottom to top. */
  overlays: string[];
}

/**
 * The overlay on top is what the user is looking at and touching, so it
 * decides; with nothing open the tab does. An unknown name is 'legacy', so a
 * screen nobody has redesigned can never turn up in the wrong colours.
 */
export const lookOf = (state: ScreenState): Look => {
  const top = state.overlays[state.overlays.length - 1];
  if (top !== undefined) return NEW_LOOK_OVERLAYS.includes(top) ? 'new' : 'legacy';
  return NEW_LOOK_TABS.includes(state.tab) ? 'new' : 'legacy';
};
