# Bounty Handoff: Issue #675

## Issue

https://github.com/pmxt-dev/pmxt/issues/675

## Validation / Reproduction

Validated the raw integer precision loss locally:

```sh
node - <<'NODE'
const raw = 9007199254740993n;
console.log('legacy', parseFloat(raw.toString()) / 1_000_000);
const scale = 1_000_000n;
console.log('split', Number(raw / scale) + Number(raw % scale) / 1_000_000);
console.log('format parse example', parseFloat('9999999999.999999'));
NODE
```

Output:

```text
legacy 9007199254.740992
split 9007199254.740993
format parse example 9999999999.999998
```

Note: Node did not reproduce the issue body's exact `parseFloat("9999999999.999999") = 10000000000` example; it rounded to `9999999999.999998` in this environment. The raw integer `parseFloat(rawBalance.toString()) / Math.pow(...)` loss did reproduce.

## Diff Summary

- Added `scaledIntegerToNumber` in `core/src/exchanges/limitless/utils.ts`.
- Updated `core/src/exchanges/limitless/client.ts` balance conversion to avoid `parseFloat(utils.formatUnits(...))`.
- Updated `core/src/exchanges/limitless/index.ts` balance conversion to avoid parsing the raw integer string before scaling and to remove `Math.pow` from this balance path.
- Added `core/test/unit/limitless-balance.core.test.ts` covering the `2^53 + 1` raw balance case and ethers `BigNumber` input.

## Commands Run

```sh
gh issue view https://github.com/pmxt-dev/pmxt/issues/675 --json title,body,comments,state,labels,author
```

Failed: `gh` is not installed in this environment.

```sh
rg -n "parseFloat|Math\.pow|formatUnits|formatEther|Number\(" -S .
git status --short && git branch --show-current && git remote -v
npm --workspace=pmxt-core test -- --runTestsByPath core/test/unit/limitless-balance.core.test.ts
```

Failed before running tests because dependencies were not installed and `jest` was not found.

```sh
npm install
npm --workspace=pmxt-core test -- --runTestsByPath core/test/unit/limitless-balance.core.test.ts
```

Failed because the workspace script resolves paths from `core/`, producing `core/core/test/...`.

```sh
npm --workspace=pmxt-core test -- --runTestsByPath test/unit/limitless-balance.core.test.ts
npm --workspace=pmxt-core run build
```

## Test Results

- `npm --workspace=pmxt-core test -- --runTestsByPath test/unit/limitless-balance.core.test.ts`: passed, 2 tests.
- `npm --workspace=pmxt-core run build`: passed.

## Remaining Risk

The public balance API still returns `number`, so very large balances remain limited by IEEE-754 representation after the final conversion. This change removes the avoidable extra precision loss from converting the full raw integer to a float before decimal scaling.
