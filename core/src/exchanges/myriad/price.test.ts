import { resolveMyriadPrice } from "./price";

describe("resolveMyriadPrice", () => {
  test("divides value by shares", () => {
    expect(resolveMyriadPrice({ value: 100, shares: 4 })).toBe(25);
  });

  test("treats missing shares as 1", () => {
    expect(resolveMyriadPrice({ value: 50 })).toBe(50);
  });

  test("treats zero shares as 1 to avoid division by zero", () => {
    expect(resolveMyriadPrice({ value: 80, shares: 0 })).toBe(80);
  });

  test("treats missing value as 0", () => {
    expect(resolveMyriadPrice({ shares: 5 })).toBe(0);
  });
});
