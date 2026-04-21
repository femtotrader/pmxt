/**
 * Reproduction for https://github.com/pmxt-dev/pmxt/issues/95
 *
 * offset and limit are silently ignored on fetchMarkets / fetchEvents
 * when no filter is provided.  The bug is in BaseExchange: the no-filter
 * branch returns the full result set from fetchMarketsImpl / fetchEventsImpl
 * without slicing.
 */
import { PredictionMarketExchange, MarketFetchParams, EventFetchParams } from '../../src/BaseExchange';
import { UnifiedMarket, UnifiedEvent } from '../../src/types';

// ---------------------------------------------------------------------------
// Minimal concrete exchange
// ---------------------------------------------------------------------------

class StubExchange extends PredictionMarketExchange {
    get name() { return 'StubExchange'; }

    private mockMarkets: UnifiedMarket[];
    private mockEvents: UnifiedEvent[];

    constructor(markets: UnifiedMarket[], events: UnifiedEvent[]) {
        super();
        this.mockMarkets = markets;
        this.mockEvents = events;
    }

    protected async fetchMarketsImpl(_params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        return this.mockMarkets;
    }

    protected async fetchEventsImpl(_params: EventFetchParams): Promise<UnifiedEvent[]> {
        return this.mockEvents;
    }
}

// ---------------------------------------------------------------------------
// Fixtures — 5 markets, 4 events
// ---------------------------------------------------------------------------

function makeMarket(id: string): UnifiedMarket {
    return {
        marketId: id,
        title: `Market ${id}`,
        outcomes: [{ outcomeId: `${id}-yes`, label: 'Yes', price: 0.5, priceChange24h: 0 }],
        volume24h: 1000,
        liquidity: 1000,
        url: `https://example.com/${id}`,
    };
}

function makeEvent(id: string): UnifiedEvent {
    return {
        id,
        title: `Event ${id}`,
        slug: `event-${id}`,
        url: `https://example.com/event/${id}`,
        markets: [],
    };
}

const markets = ['m1', 'm2', 'm3', 'm4', 'm5'].map(makeMarket);
const events = ['e1', 'e2', 'e3', 'e4'].map(makeEvent);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('issue #95 — offset/limit without filter', () => {
    describe('fetchMarkets', () => {
        it('respects limit without a filter', async () => {
            const exchange = new StubExchange(markets, events);
            const result = await exchange.fetchMarkets({ limit: 2 });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.marketId)).toEqual(['m1', 'm2']);
        });

        it('respects offset without a filter', async () => {
            const exchange = new StubExchange(markets, events);
            const result = await exchange.fetchMarkets({ offset: 3 });
            expect(result.map(m => m.marketId)).toEqual(['m4', 'm5']);
        });

        it('respects offset + limit without a filter', async () => {
            const exchange = new StubExchange(markets, events);
            const result = await exchange.fetchMarkets({ offset: 1, limit: 2 });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.marketId)).toEqual(['m2', 'm3']);
        });

        it('different offsets return different results', async () => {
            const exchange = new StubExchange(markets, events);
            const page1 = await exchange.fetchMarkets({ offset: 0, limit: 2 });
            const page2 = await exchange.fetchMarkets({ offset: 2, limit: 2 });
            expect(page1.map(m => m.marketId)).toEqual(['m1', 'm2']);
            expect(page2.map(m => m.marketId)).toEqual(['m3', 'm4']);
        });
    });

    describe('fetchEvents', () => {
        it('respects limit without a filter', async () => {
            const exchange = new StubExchange(markets, events);
            const result = await exchange.fetchEvents({ limit: 2 });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toEqual(['e1', 'e2']);
        });

        it('respects offset without a filter', async () => {
            const exchange = new StubExchange(markets, events);
            const result = await exchange.fetchEvents({ offset: 2 });
            expect(result.map(e => e.id)).toEqual(['e3', 'e4']);
        });

        it('respects offset + limit without a filter', async () => {
            const exchange = new StubExchange(markets, events);
            const result = await exchange.fetchEvents({ offset: 1, limit: 2 });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toEqual(['e2', 'e3']);
        });

        it('different offsets return different results', async () => {
            const exchange = new StubExchange(markets, events);
            const page1 = await exchange.fetchEvents({ offset: 0, limit: 1 });
            const page2 = await exchange.fetchEvents({ offset: 1, limit: 1 });
            expect(page1.map(e => e.id)).toEqual(['e1']);
            expect(page2.map(e => e.id)).toEqual(['e2']);
        });
    });
});
