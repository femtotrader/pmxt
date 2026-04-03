export * from './BaseExchange';
export * from './types';
export * from './utils/math';
export { parseOpenApiSpec } from './utils/openapi';
export * from './errors';
export * from './exchanges/polymarket';
export * from './exchanges/limitless';
export * from './exchanges/kalshi';
export * from './exchanges/kalshi-demo';
export * from './exchanges/probable';
export * from './exchanges/baozi';
export * from './exchanges/myriad';
export * from './exchanges/opinion';
export * from './exchanges/metaculus';
export * from './server/app';
export * from './server/utils/port-manager';
export * from './server/utils/lock-file';

import { PolymarketExchange } from './exchanges/polymarket';
import { LimitlessExchange } from './exchanges/limitless';
import { KalshiExchange } from './exchanges/kalshi';
import { KalshiDemoExchange } from './exchanges/kalshi-demo';
import { ProbableExchange } from './exchanges/probable';
import { BaoziExchange } from './exchanges/baozi';
import { MyriadExchange } from './exchanges/myriad';
import { OpinionExchange } from './exchanges/opinion';
import { MetaculusExchange } from './exchanges/metaculus';

const pmxt = {
    Polymarket: PolymarketExchange,
    Limitless: LimitlessExchange,
    Kalshi: KalshiExchange,
    KalshiDemo: KalshiDemoExchange,
    Probable: ProbableExchange,
    Baozi: BaoziExchange,
    Myriad: MyriadExchange,
    Opinion: OpinionExchange,
    Metaculus: MetaculusExchange,
};

export const Polymarket = PolymarketExchange;
export const Limitless = LimitlessExchange;
export const Kalshi = KalshiExchange;
export const KalshiDemo = KalshiDemoExchange;
export const Probable = ProbableExchange;
export const Baozi = BaoziExchange;
export const Myriad = MyriadExchange;
export const Opinion = OpinionExchange;
export const Metaculus = MetaculusExchange;

export default pmxt;
