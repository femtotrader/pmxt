import { OHLCVParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade, Position, Balance, CandleInterval, MarketOutcome } from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { MyriadRawMarket, MyriadRawQuestion, MyriadRawTradeEvent, MyriadRawPortfolioItem } from './fetcher';
import { resolveMyriadPrice } from './price';

function selectTimeframe(interval: CandleInterval): string {
    switch (interval) {
        case '1m':
        case '5m':
            return '24h';
        case '15m':
        case '1h':
            return '7d';
        case '6h':
        case '1d':
            return '30d';
        default:
            return '7d';
    }
}

export class MyriadNormalizer implements IExchangeNormalizer<MyriadRawMarket, MyriadRawQuestion> {

    normalizeMarket(raw: MyriadRawMarket): UnifiedMarket | null {
        if (!raw) return null;

        const outcomes: MarketOutcome[] = (raw.outcomes || []).map((o) => ({
            outcomeId: `${raw.networkId}:${raw.id}:${o.id}`,
            marketId: `${raw.networkId}:${raw.id}`,
            label: o.title || `Outcome ${o.id}`,
            price: Number(o.price) || 0,
            priceChange24h: o.priceChange24h != null ? Number(o.priceChange24h) : undefined,
        }));

        const um = {
            marketId: `${raw.networkId}:${raw.id}`,
            eventId: raw.questionId ? String(raw.questionId) : undefined,
            title: raw.title || '',
            description: raw.description || '',
            outcomes,
            resolutionDate: raw.expiresAt ? new Date(raw.expiresAt) : new Date(0),
            volume24h: Number(raw.volume24h || 0),
            volume: Number(raw.volume || 0),
            liquidity: Number(raw.liquidity || 0),
            url: `https://myriad.markets/markets/${raw.slug || raw.id}`,
            image: raw.imageUrl,
            tags: raw.topics || [],
        } as UnifiedMarket;

        addBinaryOutcomes(um);
        return um;
    }

    normalizeEvent(raw: MyriadRawQuestion): UnifiedEvent | null {
        if (!raw) return null;

        const markets: UnifiedMarket[] = [];
        for (const m of raw.markets || []) {
            const um = this.normalizeMarket(m);
            if (um) markets.push(um);
        }

        return {
            id: String(raw.id),
            title: raw.title || '',
            description: '',
            slug: String(raw.id),
            markets,
            volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
            volume: markets.some(m => m.volume !== undefined)
                ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0)
                : undefined,
            url: `https://myriad.markets`,
        };
    }

    normalizeOHLCV(raw: MyriadRawMarket, params: OHLCVParams, outcomeId?: string): PriceCandle[] {
        const outcomes = raw.outcomes || [];

        let targetOutcome = outcomes[0];
        if (outcomeId !== undefined) {
            const found = outcomes.find((o) => String(o.id) === outcomeId);
            if (found) targetOutcome = found;
        }

        if (!targetOutcome || !targetOutcome.price_charts) {
            return [];
        }

        const desiredTimeframe = selectTimeframe(params.resolution);
        const charts = targetOutcome.price_charts;

        let prices: { value: number; timestamp: number }[] | null = null;
        for (const key of Object.keys(charts)) {
            const chart = charts[key];
            if (chart && chart.timeframe === desiredTimeframe && Array.isArray(chart.prices)) {
                prices = chart.prices;
                break;
            }
        }

        if (!prices || prices.length === 0) {
            return [];
        }

        const candles: PriceCandle[] = prices.map((point) => ({
            timestamp: point.timestamp ? point.timestamp * 1000 : Date.now(),
            open: Number(point.value || 0),
            high: Number(point.value || 0),
            low: Number(point.value || 0),
            close: Number(point.value || 0),
            volume: undefined,
        }));

        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }

        return candles;
    }

    normalizeOrderBook(raw: MyriadRawMarket, id: string): OrderBook {
        const parts = id.split(':');
        const outcomeId = parts.length >= 3 ? parts[2] : undefined;
        const outcomes = raw.outcomes || [];
        const outcome = outcomes.find((o) => String(o.id) === outcomeId) || outcomes[0];

        if (!outcome) {
            return { bids: [], asks: [], timestamp: Date.now() };
        }

        const price = Number(outcome.price) || 0.5;
        const liquidity = Number(raw.liquidity || 0);
        const size = liquidity > 0 ? liquidity : 1;

        return {
            bids: [{ price, size }],
            asks: [{ price, size }],
            timestamp: Date.now(),
        };
    }

    normalizeTrade(raw: MyriadRawTradeEvent, index: number): Trade {
        return {
            id: `${raw.blockNumber || raw.timestamp}-${index}`,
            timestamp: (raw.timestamp || 0) * 1000,
            price: resolveMyriadPrice(raw),
            amount: Number(raw.shares || 0),
            side: raw.action === 'buy' ? 'buy' as const : 'sell' as const,
        };
    }

    normalizeUserTrade(raw: MyriadRawTradeEvent, index: number): UserTrade {
        return {
            id: `${raw.blockNumber || raw.timestamp}-${index}`,
            timestamp: (raw.timestamp || 0) * 1000,
            price: resolveMyriadPrice(raw),
            amount: Number(raw.shares || 0),
            side: raw.action === 'buy' ? 'buy' as const : 'sell' as const,
        };
    }

    normalizePosition(raw: MyriadRawPortfolioItem): Position {
        return {
            marketId: `${raw.networkId}:${raw.marketId}`,
            outcomeId: `${raw.networkId}:${raw.marketId}:${raw.outcomeId}`,
            outcomeLabel: raw.outcomeTitle || `Outcome ${raw.outcomeId}`,
            size: Number(raw.shares || 0),
            entryPrice: Number(raw.price || 0),
            currentPrice: resolveMyriadPrice(raw),
            unrealizedPnL: Number(raw.profit || 0),
        };
    }

    normalizeBalance(rawItems: MyriadRawPortfolioItem[]): Balance[] {
        let totalValue = 0;
        for (const pos of rawItems) {
            totalValue += Number(pos.value || 0);
        }

        return [{
            currency: 'USDC',
            total: totalValue,
            available: 0,
            locked: totalValue,
        }];
    }
}
