import { moveTargets, POT_PLACE, SPLIT_PLACE, WALLET_PLACE } from '../services/movePlaces';
import { eq, report } from './harness';

eq('the wallet reaches the goals, by shares or one of them', moveTargets(WALLET_PLACE, ['a', 'b'], true), [SPLIT_PLACE, 'a', 'b']);
eq('no share set: no by-shares choice', moveTargets(WALLET_PLACE, ['a'], false), ['a']);
eq('the wallet cannot reach the investing cash directly', moveTargets(WALLET_PLACE, ['a'], true).includes(POT_PLACE), false);
eq('the investing cash goes back to the goals', moveTargets(POT_PLACE, ['a'], true), [SPLIT_PLACE, 'a']);
eq('a goal goes to the wallet or the investing cash', moveTargets('a', ['a', 'b'], true), [WALLET_PLACE, POT_PLACE]);
eq('there is no goal-to-goal entry, so it is not offered', moveTargets('a', ['a', 'b'], true).includes('b'), false);

report();
