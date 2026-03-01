import { fromKalshiCents, invertKalshiCents, invertKalshiUnified } from "./price";

describe("fromKalshiCents", () => {
  test("converts cents to a decimal probability", () => {
    expect(fromKalshiCents(55)).toBe(0.55);
    expect(fromKalshiCents(0)).toBe(0);
    expect(fromKalshiCents(100)).toBe(1);
  });
});

describe("invertKalshiCents", () => {
  test("returns the complement of a cent value", () => {
    expect(invertKalshiCents(45)).toBeCloseTo(0.55);
    expect(invertKalshiCents(0)).toBe(1);
    expect(invertKalshiCents(100)).toBe(0);
  });
});

describe("invertKalshiUnified", () => {
  test("returns the complement of a normalized price", () => {
    expect(invertKalshiUnified(0.45)).toBeCloseTo(0.55);
    expect(invertKalshiUnified(0)).toBe(1);
    expect(invertKalshiUnified(1)).toBe(0);
  });
});
