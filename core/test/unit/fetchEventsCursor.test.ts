import { MarketFetchParams, PredictionMarketExchange, EventFetchParams, PaginatedEventsResult } from '../../src/BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../src/types';

class CursorTestExchange extends PredictionMarketExchange {
    get name() { return 'CursorTestExchange'; }
    public fetchEventsImplCalls = 0;
    private readonly mockEvents: UnifiedEvent[];

    constructor(events: UnifiedEvent[], snapshotTTL?: number) {
        super(undefined, { snapshotTTL });
        this.mockEvents = events;
    }

    protected async fetchMarketsImpl(_params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        return [];
    }

    protected async fetchEventsImpl(_params: EventFetchParams): Promise<UnifiedEvent[]> {
        this.fetchEventsImplCalls++;
        return this.mockEvents;
    }
}

function makeEvents(count: number): UnifiedEvent[] {
    const events: UnifiedEvent[] = [];
    for (let i = 0; i < count; i++) {
        events.push({
            id: `e-${i}`,
            title: `Event ${i}`,
            description: '',
            slug: `event-${i}`,
            markets: [],
            volume24h: i,
            url: `https://example.com/e-${i}`,
        });
    }
    return events;
}

describe('fetchEventsPaginated cursor pagination', () => {
    it('should return consistent pages from a snapshot', async () => {
        const exchange = new CursorTestExchange(makeEvents(6), 60_000);

        const page1 = await exchange.fetchEventsPaginated({ limit: 2 });
        expect(page1.data.map(e => e.id)).toEqual(['e-0', 'e-1']);
        expect(page1.total).toBe(6);
        expect(page1.nextCursor).toBeDefined();
        expect(exchange.fetchEventsImplCalls).toBe(1);

        const page2 = await exchange.fetchEventsPaginated({ limit: 2, cursor: page1.nextCursor! });
        expect(page2.data.map(e => e.id)).toEqual(['e-2', 'e-3']);
        expect(page2.total).toBe(6);
        expect(page2.nextCursor).toBeDefined();
        // Should not refetch from implementation when cursor is used
        expect(exchange.fetchEventsImplCalls).toBe(1);

        const page3 = await exchange.fetchEventsPaginated({ limit: 2, cursor: page2.nextCursor! });
        expect(page3.data.map(e => e.id)).toEqual(['e-4', 'e-5']);
        expect(page3.nextCursor).toBeUndefined();
        expect(exchange.fetchEventsImplCalls).toBe(1);
    });

    it('should return full data with no cursor/limit and no nextCursor', async () => {
        const exchange = new CursorTestExchange(makeEvents(3), 60_000);
        const result = await exchange.fetchEventsPaginated();

        expect(result.data).toHaveLength(3);
        expect(result.total).toBe(3);
        expect(result.nextCursor).toBeUndefined();
        expect(exchange.fetchEventsImplCalls).toBe(1);
    });

    it('should reject expired cursor after TTL', async () => {
        const exchange = new CursorTestExchange(makeEvents(4), 1);
        const page1 = await exchange.fetchEventsPaginated({ limit: 2 });
        expect(page1.nextCursor).toBeDefined();

        await new Promise(resolve => setTimeout(resolve, 10));

        await expect(
            exchange.fetchEventsPaginated({ limit: 2, cursor: page1.nextCursor! })
        ).rejects.toThrow('Cursor has expired');
    });

    it('should keep fetchEvents non-breaking and return plain arrays', async () => {
        const exchange = new CursorTestExchange(makeEvents(3), 60_000);
        const events = await exchange.fetchEvents({ limit: 2 });

        expect(Array.isArray(events)).toBe(true);
        expect(events).toHaveLength(2);
    });
});
