import { BROKERS, brokerageCents, type BrokerageRule } from '../services/fees';
import { bpText, inputsFromRule, parseCustomRule, rmText, ruleSummary } from '../components/invest/BrokerPicker';
import { setup as en } from '../i18n/en/setup';
import { setup as zh } from '../i18n/zh/setup';
import { QUESTION_POINTS } from '../services/advisor/model';
import { eq, report } from './harness';

const rule = (id: string) => BROKERS.find((b) => b.id === id)!.rule;

// --- how rates are written

eq('bp: 8 is 0.08%', bpText(8), '0.08%');
eq('bp: 10 is 0.1%, no trailing zero', bpText(10), '0.1%');
eq('bp: 8.5 is 0.085%', bpText(8.5), '0.085%');
eq('RM: whole ringgit drop the cents', rmText(800), 'RM8');
eq('RM: thousands are grouped', rmText(1_000_000), 'RM10,000');
eq('RM: odd sen are kept', rmText(288), 'RM2.88');
eq('RM: RM2.50 keeps its zero', rmText(250), 'RM2.50');

// --- every listed broker, in both languages

eq('summary en: M+', ruleSummary(rule('mplus'), en), '0.08%, minimum RM8');
eq('summary zh: M+', ruleSummary(rule('mplus'), zh), '0.08%，最低 RM8');
eq('summary en: Webull', ruleSummary(rule('webull'), en), '0.05%, minimum RM2.50');
eq('summary en: Maybank', ruleSummary(rule('maybank'), en), '0.1%, minimum RM8');
eq('summary en: CGS', ruleSummary(rule('cgs'), en), '0.06%, minimum RM8');
eq('summary en: Moomoo', ruleSummary(rule('moomoo'), en), '0.03% + RM3 platform fee per order');
eq('summary zh: Moomoo', ruleSummary(rule('moomoo'), zh), '0.03% + 每单 RM3 平台费');
eq(
  'summary en: Affin — one middle step needs no bounds',
  ruleSummary(rule('affin'), en),
  'RM5 under RM10,000 · 0.08% · 0.05% from RM100,000'
);
eq(
  'summary zh: Affin',
  ruleSummary(rule('affin'), zh),
  'RM10,000 以下 RM5 · 0.08% · RM100,000 起 0.05%'
);
eq(
  'summary en: Rakuten — several middle steps each say where they stop',
  ruleSummary(rule('rakuten'), en),
  'RM1 under RM100 · RM2.88 under RM10,000 · 0.1% under RM100,000 · RM100 from RM100,000'
);
eq(
  'summary zh: Rakuten',
  ruleSummary(rule('rakuten'), zh),
  'RM100 以下 RM1 · RM10,000 以下 RM2.88 · RM100,000 以下 0.1% · RM100,000 起 RM100'
);
eq(
  'summary: every broker has a non-empty line in both languages',
  BROKERS.every((b) => ruleSummary(b.rule, en).length > 0 && ruleSummary(b.rule, zh).length > 0),
  true
);
eq(
  'summary: a tier with both a flat fee and a percentage names both',
  ruleSummary({ kind: 'tiers', tiers: [{ upToCents: 500_000, flatCents: 300 }, { upToCents: null, flatCents: 100, bp: 5 }] }, en),
  'RM3 under RM5,000 · RM1 + 0.05% from RM5,000'
);

// --- the "Mine isn't listed" form

const parse = (percent: string, minimum = '', flat = '') => parseCustomRule({ percent, minimum, flat });

eq('custom: percentage and minimum', parse('0.08', '8'), { rule: { kind: 'percent', bp: 8, minCents: 800 } });
eq('custom: percentage alone has no floor', parse('0.1'), { rule: { kind: 'percent', bp: 10, minCents: 0 } });
eq('custom: flat fee without a minimum', parse('0.03', '', '3'), {
  rule: { kind: 'percentPlusFlat', bp: 3, flatCents: 300 },
});
eq('custom: a zero minimum with a flat fee is a flat fee', parse('0.03', '0', '3'), {
  rule: { kind: 'percentPlusFlat', bp: 3, flatCents: 300 },
});
eq('custom: a zero flat fee is ignored', parse('0.08', '8', '0'), { rule: { kind: 'percent', bp: 8, minCents: 800 } });
eq('custom: both a minimum and a flat fee is refused', parse('0.08', '8', '3'), { error: 'both' });
eq('custom: surrounding spaces are fine', parse(' 0.085 ', ' 2.5 '), { rule: { kind: 'percent', bp: 8.5, minCents: 250 } });
eq('custom: ".05" reads as 0.05', parse('.05'), { rule: { kind: 'percent', bp: 5, minCents: 0 } });
eq('custom: 0% is allowed', parse('0'), { rule: { kind: 'percent', bp: 0, minCents: 0 } });
eq('custom: 2% is the top', parse('2'), { rule: { kind: 'percent', bp: 200, minCents: 0 } });
eq('custom: percentage is required', parse(''), { error: 'percent' });
eq('custom: above 2% is refused', parse('2.01'), { error: 'percent' });
eq('custom: negative is refused', parse('-0.1'), { error: 'percent' });
eq('custom: words are refused', parse('abc'), { error: 'percent' });
eq('custom: two dots are refused', parse('0.0.8'), { error: 'percent' });
eq('custom: minimum above RM100 is refused', parse('0.08', '100.01'), { error: 'minimum' });
eq('custom: minimum RM100 is allowed', parse('0.08', '100'), { rule: { kind: 'percent', bp: 8, minCents: 10_000 } });
eq('custom: a minimum that is not a number is refused', parse('0.08', 'RM8'), { error: 'minimum' });
eq('custom: a flat fee above RM100 is refused', parse('0.08', '', '101'), { error: 'flat' });
eq('custom: 0.07 does not drift to 7.000000000000001 bp', parse('0.07'), { rule: { kind: 'percent', bp: 7, minCents: 0 } });

{
  const parsed = parse('0.08', '8');
  const got = 'rule' in parsed ? brokerageCents(1_060_00, parsed.rule) : null;
  eq('custom: the parsed rule prices the M+ note the same as M+', got, brokerageCents(1_060_00, rule('mplus')));
}

// --- filling the form back in

eq('prefill: percent rule', inputsFromRule({ kind: 'percent', bp: 8, minCents: 800 }), { percent: '0.08', minimum: '8', flat: '' });
eq('prefill: no floor leaves the minimum empty', inputsFromRule({ kind: 'percent', bp: 10, minCents: 0 }), {
  percent: '0.1',
  minimum: '',
  flat: '',
});
eq('prefill: flat fee rule', inputsFromRule({ kind: 'percentPlusFlat', bp: 3, flatCents: 250 }), {
  percent: '0.03',
  minimum: '',
  flat: '2.5',
});
eq('prefill: nothing saved', inputsFromRule(null), { percent: '', minimum: '', flat: '' });
{
  const saved: BrokerageRule = { kind: 'percentPlusFlat', bp: 8.5, flatCents: 288 };
  eq('prefill: round trip', parseCustomRule(inputsFromRule(saved)), { rule: saved });
}

// --- the questions line up with the model

eq(
  'questions en: one per model question, with as many options as it scores',
  en.questions.map((q) => q.options.length),
  QUESTION_POINTS.map((q) => q.length)
);
eq(
  'questions zh: the same shape as English',
  zh.questions.map((q) => q.options.length),
  QUESTION_POINTS.map((q) => q.length)
);

report();
