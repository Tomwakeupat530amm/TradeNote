// Pure seed-count verdict for scripts/p6_prod_smoke.mjs (B6). The test account is not empty
// before seeding (the storage suite inserts one trade first), so the expected DB count is
// baseline + seeded, and the keyset load must return exactly the DB count.
export function seedCountVerdict({ baseline, seeded, loaded, dbCount }) {
  const expected = baseline + seeded;
  const ok = loaded === dbCount && dbCount === expected;
  return {
    status: ok ? 'PASS' : 'FAIL',
    detail: `baseline=${baseline} seeded=${seeded} expected=${expected} loaded=${loaded} count(DB)=${dbCount}`,
  };
}
