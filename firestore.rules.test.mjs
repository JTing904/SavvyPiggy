import fs from 'node:fs';
import assert from 'node:assert';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, collection, getDocs, query, orderBy } from 'firebase/firestore';

const PROJECT = 'savvypiggy-rules-test';
let pass = 0, fail = 0;

const test = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`);
  }
};

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: {
    host: '127.0.0.1',
    port: 8567,
    rules: fs.readFileSync('firestore.rules', 'utf8'),
  },
});

// --- seed: two unclaimed invite codes, created out-of-band like the console does
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'invites/ALPHA1'), { note: 'for alice' });
  await setDoc(doc(db, 'invites/BETA22'), { note: 'for bob' });
  await setDoc(doc(db, 'invites/USED99'), { claimedBy: 'someone-else', claimedAt: 1 });
});

const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const anon = env.unauthenticatedContext().firestore();

const claim = (db, uid, code) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'invites', code), { claimedBy: uid, claimedAt: Date.now() });
  batch.set(doc(db, 'members', uid), { code, joinedAt: Date.now() });
  return batch.commit();
};

console.log('\nBEFORE redeeming an invite');

await test('signed-out user cannot read an invite', () =>
  assertFails(getDoc(doc(anon, 'invites/ALPHA1'))));

await test('signed-in user cannot list all invite codes', () =>
  assertFails(getDocs(collection(alice, 'invites'))));

await test('non-member cannot read own user doc', () =>
  assertFails(getDoc(doc(alice, 'users/alice'))));

await test('non-member cannot write own user doc', () =>
  assertFails(setDoc(doc(alice, 'users/alice'), { displayName: 'Alice' })));

await test('non-member cannot write a piggy bank', () =>
  assertFails(setDoc(doc(alice, 'users/alice/banks/b1'), { name: 'Sneaky', currentAmount: 0 })));

await test('cannot self-grant membership without burning a code', () =>
  assertFails(setDoc(doc(alice, 'members/alice'), { code: 'ALPHA1', joinedAt: 1 })));

await test('cannot claim an invite in alice\'s name for a fake code', () =>
  assertFails(claim(alice, 'alice', 'NOPE00')));

await test('cannot claim an already-used code', () =>
  assertFails(claim(alice, 'alice', 'USED99')));

await test('cannot stamp someone else\'s uid on an invite', () =>
  assertFails(claim(alice, 'bob', 'ALPHA1')));

await test('cannot smuggle extra fields into an invite update', () =>
  assertFails(updateDoc(doc(alice, 'invites/ALPHA1'), { claimedBy: 'alice', note: 'hacked' })));

console.log('\nREDEEMING');

await test('alice redeems ALPHA1 successfully', () =>
  assertSucceeds(claim(alice, 'alice', 'ALPHA1')));

await test('alice can now read her own user doc', () =>
  assertSucceeds(getDoc(doc(alice, 'users/alice'))));

await test('alice can now write a piggy bank', () =>
  assertSucceeds(setDoc(doc(alice, 'users/alice/banks/b1'), { name: 'Vacation', currentAmount: 0 })));

await test('alice can write an activity', () =>
  assertSucceeds(setDoc(doc(alice, 'users/alice/activities/a1'), { amount: 10 })));

// The app subscribes with ordered queries, which are list ops, not gets.
await test('alice can QUERY her banks ordered by createdAt', () =>
  assertSucceeds(getDocs(query(collection(alice, 'users/alice/banks'), orderBy('createdAt', 'asc')))));

await test('alice can QUERY her activities ordered by date', () =>
  assertSucceeds(getDocs(query(collection(alice, 'users/alice/activities'), orderBy('date', 'desc')))));

await test('alice can write a recurring deposit schedule', () =>
  assertSucceeds(setDoc(doc(alice, 'users/alice/schedules/s1'), { amount: 50, frequency: 'monthly' })));

await test('alice can QUERY her schedules ordered by createdAt', () =>
  assertSucceeds(getDocs(query(collection(alice, 'users/alice/schedules'), orderBy('createdAt', 'asc')))));

await test('alice can read her own members doc', () =>
  assertSucceeds(getDoc(doc(alice, 'members/alice'))));

console.log('\nAFTER redeeming (isolation + one-time use)');

await test('a second person cannot reuse ALPHA1', () =>
  assertFails(claim(bob, 'bob', 'ALPHA1')));

await test('alice cannot re-claim her own spent code', () =>
  assertFails(updateDoc(doc(alice, 'invites/ALPHA1'), { claimedBy: 'alice' })));

await test('bob (no invite) still cannot read alice\'s banks', () =>
  assertFails(getDoc(doc(bob, 'users/alice/banks/b1'))));

await test('bob redeems his own separate code', () =>
  assertSucceeds(claim(bob, 'bob', 'BETA22')));

await test('member bob still cannot read alice\'s banks', () =>
  assertFails(getDoc(doc(bob, 'users/alice/banks/b1'))));

await test('member bob cannot write into alice\'s tree', () =>
  assertFails(setDoc(doc(bob, 'users/alice/banks/b2'), { name: 'Evil' })));

await test('alice cannot delete her membership to free the code', () =>
  assertFails(setDoc(doc(alice, 'members/alice'), { code: 'BETA22', joinedAt: 2 })));

await env.cleanup();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
