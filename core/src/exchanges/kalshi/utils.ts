import { CandleInterval } from "../../types";

export function mapIntervalToKalshi(interval: CandleInterval): number {
  const mapping: Record<CandleInterval, number> = {
    "1m": 1,
    "5m": 1,
    "15m": 1,
    "1h": 60,
    "6h": 60,
    "1d": 1440,
  };
  return mapping[interval];
}
