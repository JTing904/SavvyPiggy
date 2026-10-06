import { amountToCents, formatTyped, pressKey } from '../services/keypad';
import { eq, report } from './harness';

const type = (keys: string, from = '') => [...keys].reduce(pressKey, from);

// --- digits and the dot
eq('first digit', pressKey('', '5'), '5');
eq('digits append', type('1234'), '1234');
eq('a dot on empty gives 0.', pressKey('', '.'), '0.');
eq('a dot on 0 gives 0.', pressKey('0', '.'), '0.');
eq('a dot after digits', pressKey('12', '.'), '12.');
eq('a second dot is ignored', pressKey('12.', '.'), '12.');
eq('a second dot after decimals is ignored', pressKey('12.5', '.'), '12.5');
eq('an unknown key changes nothing', pressKey('12', 'x'), '12');

// --- leading zeros
eq('0 then 5 is 5', type('05'), '5');
eq('00 is impossible', type('00'), '0');
eq('000 is impossible', type('000'), '0');
eq('0 then dot then 0 keeps the zero', type('0.0'), '0.0');
eq('zero inside a number is kept', type('105'), '105');

// --- two decimals at most
eq('1234.5 typed key by key', type('1234.5'), '1234.5');
eq('two decimals fit', type('1234.56'), '1234.56');
eq('a third decimal is ignored', pressKey('1234.56', '7'), '1234.56');
eq('a third decimal zero is ignored too', pressKey('0.05', '0'), '0.05');

// --- seven integer digits at most
eq('seven integer digits fit', type('1234567'), '1234567');
eq('an eighth integer digit is ignored', pressKey('1234567', '8'), '1234567');
eq('a dot still works at seven digits', pressKey('1234567', '.'), '1234567.');
eq('decimals still work after seven digits', type('1234567.99'), '1234567.99');

// --- backspace
eq('backspace removes one digit', pressKey('123', 'b'), '12');
eq('backspace on empty stays empty', pressKey('', 'b'), '');
eq('backspace through a dot', type('bbb', '1.5'), '');
eq('backspace removes the dot, keeping the whole part', pressKey('1.', 'b'), '1');
eq('backspace on 0. leaves 0', pressKey('0.', 'b'), '0');
eq('backspace on 0 leaves empty', pressKey('0', 'b'), '');
eq('backspace frees a decimal place', type('b5', '1.25'), '1.25');

// --- cents
eq('empty is 0 cents', amountToCents(''), 0);
eq('a lone dot is 0 cents', amountToCents('.'), 0);
eq('0. is 0 cents', amountToCents('0.'), 0);
eq('whole ringgit', amountToCents('12'), 1200);
eq('one decimal is tens of sen', amountToCents('1234.5'), 123450);
eq('4.35 survives the float', amountToCents('4.35'), 435);
eq('0.07', amountToCents('0.07'), 7);
eq('largest amount', amountToCents('9999999.99'), 999999999);

// --- display
eq('nothing typed shows 0', formatTyped(''), { whole: '0', cents: '', hasDot: false });
eq('thousands separator', formatTyped('1234'), { whole: '1,234', cents: '', hasDot: false });
eq('millions', formatTyped('1234567'), { whole: '1,234,567', cents: '', hasDot: false });
eq('a trailing dot is shown', formatTyped('12.'), { whole: '12', cents: '', hasDot: true });
eq('cents as typed', formatTyped('1234.5'), { whole: '1,234', cents: '5', hasDot: true });
eq('two cents', formatTyped('0.05'), { whole: '0', cents: '05', hasDot: true });

report();
