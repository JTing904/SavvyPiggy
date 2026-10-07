import { amountToCents, formatTyped, pressKey, typedFromCents } from '../services/keypad';
import { eq, report } from './harness';

const type = (keys: string[], from = '') => keys.reduce(pressKey, from);

// --- digits push in from the right
eq('first digit', pressKey('', '5'), '5');
eq('digits append', type(['1', '2', '3', '4']), '1234');
eq('6, 0, 0 is RM6.00', amountToCents(type(['6', '0', '0'])), 600);
eq('6 alone is RM0.06', amountToCents(type(['6'])), 6);
eq('6, 0 is RM0.60', amountToCents(type(['6', '0'])), 60);
eq('1, 2, 5, 0 is RM12.50', amountToCents(type(['1', '2', '5', '0'])), 1250);

// --- the 00 key
eq('6 then 00 is RM6.00', amountToCents(type(['6', '00'])), 600);
eq('00 on nothing stays nothing', type(['00']), '');
eq('00 twice on nothing stays nothing', type(['00', '00']), '');
eq('5, 0, 00 is RM50.00', amountToCents(type(['5', '0', '00'])), 5000);

// --- leading zeros never stay
eq('a zero first is nothing', pressKey('', '0'), '');
eq('0 then 5 is RM0.05', type(['0', '5']), '5');
eq('zeros then digits', type(['0', '0', '7', '5']), '75');

// --- no decimal point any more
eq('a dot changes nothing', pressKey('123', '.'), '123');
eq('an unknown key changes nothing', pressKey('12', 'x'), '12');

// --- size
eq('ten digits fit', type(['9', '9', '9', '9', '9', '9', '9', '9', '9', '9']), '9999999999');
eq('an eleventh digit is ignored', pressKey('9999999999', '1'), '9999999999');
eq('00 at the limit adds nothing', pressKey('9999999999', '00'), '9999999999');
eq('00 one short of the limit adds one digit only', pressKey('999999999', '00'), '9999999990');
eq('largest amount', amountToCents('9999999999'), 9999999999);

// --- backspace removes one digit of cents
eq('backspace removes one digit', pressKey('123', 'b'), '12');
eq('RM12.50 backs to RM1.25', amountToCents(type(['b'], '1250')), 125);
eq('backspace on empty stays empty', pressKey('', 'b'), '');
eq('backspace through everything', type(['b', 'b', 'b'], '125'), '');

// --- cents
eq('empty is 0 cents', amountToCents(''), 0);
eq('junk is 0 cents', amountToCents('12.5'), 0);
eq('digits are the cents', amountToCents('1234'), 1234);

// --- reading an amount back as typed
eq('RM6 reads back as 600', typedFromCents(600), '600');
eq('RM12.50 reads back as 1250', typedFromCents(1250), '1250');
eq('RM0.07 reads back as 7', typedFromCents(7), '7');
eq('nothing reads back as empty', typedFromCents(0), '');
eq('negative reads back as empty', typedFromCents(-5), '');

// --- display
eq('nothing typed shows 0.00', formatTyped(''), { whole: '0', cents: '00', typed: false });
eq('one digit is sen', formatTyped('6'), { whole: '0', cents: '06', typed: true });
eq('two digits are sen', formatTyped('60'), { whole: '0', cents: '60', typed: true });
eq('three digits make ringgit', formatTyped('600'), { whole: '6', cents: '00', typed: true });
eq('thousands separator', formatTyped('123456'), { whole: '1,234', cents: '56', typed: true });
eq('millions', formatTyped('123456789'), { whole: '1,234,567', cents: '89', typed: true });
eq('junk shows 0.00', formatTyped('12.5'), { whole: '0', cents: '00', typed: true });

report();
