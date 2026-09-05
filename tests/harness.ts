let passed = 0;
let failed = 0;

export const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
};

export const report = () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
};
