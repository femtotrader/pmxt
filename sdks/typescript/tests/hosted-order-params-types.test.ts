import type { CreateOrderParams } from "../pmxt/models";

describe("hosted order parameter types", () => {
  it("allow hosted market-order fields without unsafe casts", () => {
    const params = {
      marketId: "market-uuid",
      outcomeId: "outcome-uuid",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
      slippage_pct: 30,
    } satisfies CreateOrderParams;

    expect(params.denom).toBe("usdc");
    expect(params.slippage_pct).toBe(30);
  });
});
