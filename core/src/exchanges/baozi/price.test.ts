import { clampBaoziPrice, normalizeBaoziOutcomes } from "./price";
import { MarketOutcome } from "../../types";

describe("clampBaoziPrice", () => {
  test("clamps values below 0 to 0", () => {
    expect(clampBaoziPrice(-0.1)).toBe(0);
  });

  test("clamps values above 1 to 1", () => {
    expect(clampBaoziPrice(1.2)).toBe(1);
  });

  test("leaves values in range unchanged", () => {
    expect(clampBaoziPrice(0.3)).toBe(0.3);
    expect(clampBaoziPrice(0)).toBe(0);
    expect(clampBaoziPrice(1)).toBe(1);
  });
});

describe("normalizeBaoziOutcomes", () => {
  function makeOutcome(price: number): MarketOutcome {
    return { outcomeId: "x", marketId: "m", label: "X", price };
  }

  test("normalizes prices to sum to 1", () => {
    const outcomes = [makeOutcome(2), makeOutcome(3)];
    normalizeBaoziOutcomes(outcomes);
    expect(outcomes[0].price).toBeCloseTo(0.4);
    expect(outcomes[1].price).toBeCloseTo(0.6);
  });

  test("does nothing when sum is zero", () => {
    const outcomes = [makeOutcome(0), makeOutcome(0)];
    normalizeBaoziOutcomes(outcomes);
    expect(outcomes[0].price).toBe(0);
    expect(outcomes[1].price).toBe(0);
  });
});
