import { lookOf, NEW_LOOK_OVERLAYS, NEW_LOOK_TABS } from '../services/lookOf';
import { eq, report } from './harness';

eq('allowlist starts with the log tab', NEW_LOOK_TABS.includes('log'), true);
eq('allowlist starts with goal detail and create goal', ['goalDetail', 'createGoal'].every((o) => NEW_LOOK_OVERLAYS.includes(o)), true);

eq('log tab, nothing open -> new', lookOf({ tab: 'log', overlays: [] }), 'new');
eq('the investing Home is the new look too', lookOf({ tab: 'home', overlays: [] }), 'new');
for (const tab of ['banks', 'trades', 'dividends', 'growth']) eq(`${tab} tab is the new look`, lookOf({ tab, overlays: [] }), 'new');
eq('the savings half of Home is the new look', lookOf({ tab: 'homeSave', overlays: [] }), 'new');
eq('an unregistered overlay over the new Home is legacy', lookOf({ tab: 'homeSave', overlays: ['somethingNew'] }), 'legacy');
for (const overlay of ['profile', 'alerts', 'statements', 'monthlyBuy', 'auth']) eq(`${overlay} is the new look`, lookOf({ tab: 'homeSave', overlays: [overlay] }), 'new');
eq('unknown tab -> legacy', lookOf({ tab: 'somethingNew', overlays: [] }), 'legacy');
eq('new overlay on an unknown tab -> new', lookOf({ tab: 'somethingNew', overlays: ['goalDetail'] }), 'new');
eq('legacy overlay on a new tab -> legacy', lookOf({ tab: 'log', overlays: ['settings'] }), 'legacy');
eq('the top overlay decides: new over legacy', lookOf({ tab: 'home', overlays: ['settings', 'createGoal'] }), 'new');
eq('the top overlay decides: legacy over new', lookOf({ tab: 'log', overlays: ['goalDetail', 'settings'] }), 'legacy');

report();
