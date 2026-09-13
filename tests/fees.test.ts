import {
  brokerById,
  brokerageCents,
  costCents,
  feeDrag,
  feesFor,
  lotPlan,
  maxUnits,
  securityTypeOf,
  stampCents,
  totalFees,
  valueCents,
  type Broker,
} from '../services/fees';
import { eq, report } from './harness';

const mplus = brokerById('mplus')!;
const rakuten = brokerById('rakuten')!;
const moomoo = brokerById('moomoo')!;
const affin = brokerById('affin')!;
/** The spec's worked examples use a 0.05% / RM8 broker. */
const spec: Broker = { id: 'spec', name: 'spec', short: 'SP', color: '#000', rule: { kind: 'percent', bp: 5, minCents: 800 } };

// --- the real contract note these rules were checked against

{
  const value = valueCents(100, 106_000);
  const fees = feesFor(value, mplus);
  eq('M+ note: MAYBANK 100 @ RM10.60 is RM1,060.00 of shares', value, 106_000);
  eq('M+ note: brokerage RM8.00, clearing RM0.32, stamp RM2.00, no SST', fees, {
    brokerageCents: 800,
    clearingCents: 32,
    stampCents: 200,
    sstCents: 0,
  });
  eq('M+ note: RM1,070.32 in total', value + totalFees(fees), 107_032);
}

// --- the spec's acceptance cases

{
  const fees = feesFor(79_000, spec);
  eq('T1: RM790 pays the RM8 minimum, RM0.24 clearing, RM1 stamp', fees, {
    brokerageCents: 800,
    clearingCents: 24,
    stampCents: 100,
    sstCents: 0,
  });
  eq('T1: RM9.24 in fees', totalFees(fees), 924);
  eq('T1: fee drag is 1.17%, over the 1% warning', Math.round(feeDrag(fees, 79_000) * 10_000), 117);
}

{
  eq('T2: RM1,000 at RM7.90 buys 125 units', maxUnits(100_000, 79_000, spec), 125);
  eq('T2: 125 units cost RM996.80 with fees', costCents(125, 79_000, spec), 99_680);
  eq('T2: a 126th would cost RM1,004.70 — over', costCents(126, 79_000, spec), 100_470);
  eq('T2: one full lot and 25 odd', lotPlan(100_000, 79_000, spec), { kind: 'lots', units: 125, lots: 1, odd: 25 });
}

// --- sizing walks both ways

{
  // A cheap counter where the starting guess lands well under the answer.
  const cash = 50_000;
  const best = maxUnits(cash, 3_450, mplus);
  eq('never overspends', costCents(best, 3_450, mplus) <= cash, true);
  eq('never leaves a unit it could afford', costCents(best + 1, 3_450, mplus) > cash, true);
  eq('half-sen prices are kept exactly: 1,000 units of RM0.345 is RM345.00', valueCents(1_000, 3_450), 34_500);
}

eq('nothing to spend buys nothing', maxUnits(0, 79_000, spec), 0);
eq('short of one unit is "none"', lotPlan(500, 79_000, spec), { kind: 'none', units: 0 });
{
  const plan = lotPlan(50_000, 79_000, spec);
  eq('RM500 at RM7.90 is short of a lot', plan.kind, 'shortOfLot');
  eq('and says what a lot still needs', plan.kind === 'shortOfLot' ? plan.shortCents : -1, costCents(100, 79_000, spec) - 50_000);
}

// --- brokers

eq('Rakuten: RM2.88 flat between RM100 and RM10,000', brokerageCents(79_000, rakuten.rule), 288);
eq('Rakuten: RM1 flat under RM100', brokerageCents(9_000, rakuten.rule), 100);
eq('Rakuten: 0.1% from RM10,000', brokerageCents(2_000_000, rakuten.rule), 2_000);
eq('Rakuten: RM100 flat from RM100,000', brokerageCents(20_000_000, rakuten.rule), 10_000);
eq('Moomoo: 0.03% plus RM3 a order', brokerageCents(100_000, moomoo.rule), 330);
eq('Affin: RM5 under RM10,000', brokerageCents(500_000, affin.rule), 500);
eq('Affin: 0.05% from RM100,000', brokerageCents(20_000_000, affin.rule), 10_000);
eq('a custom rate is used when chosen', brokerageCents(100_000, brokerById('custom', { kind: 'percent', bp: 10, minCents: 700 })!.rule), 700);
eq('an unknown broker is no broker', brokerById('nobody'), null);

// --- stamp duty and REITs

eq('stamp: any part of RM1,000 counts — RM1,500 pays RM2', stampCents(150_000, 'EQUITY'), 200);
eq('stamp: shares cap at RM1,000', stampCents(5_000_000_000, 'EQUITY'), 100_000);
eq('stamp: REITs cap at RM200', stampCents(5_000_000_000, 'REIT'), 20_000);

{
  const fees = feesFor(110_400, mplus, 'REIT');
  eq('REIT: 8% SST on brokerage and clearing (RM8.33 → RM0.67)', fees.sstCents, 67);
  eq('REIT: 400 IGBREIT @ RM2.76 costs RM11.00 in fees', totalFees(fees), 1_100);
  eq('a share pays no SST at the same size', feesFor(110_400, mplus, 'EQUITY').sstCents, 0);
}

eq('IGBREIT is a REIT', securityTypeOf('5227.KL'), 'REIT');
eq('KLCC is a REIT under its stapled code', securityTypeOf('5235SS.KL'), 'REIT');
eq('MAYBANK is a share', securityTypeOf('1155.KL'), 'EQUITY');
eq('PLINTAS is a business trust, not a REIT', securityTypeOf('5320.KL'), 'EQUITY');
eq('a person can correct the tag', securityTypeOf('1155.KL', { '1155.KL': 'REIT' }), 'REIT');

report();
