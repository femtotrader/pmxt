import { addBinaryOutcomes, deduplicateMarkets } from '../../src/utils/market-utils';
import { UnifiedMarket, MarketOutcome } from '../../src/types';

describe('addBinaryOutcomes', () => {
    const createMockMarket = (outcomeLabels: string[]): UnifiedMarket => {
        const outcomes: MarketOutcome[] = outcomeLabels.map((label, index) => ({
            id: `id-${index}`,
            label,
            price: 0.5
        }));

        return {
            id: 'market-1',
            title: 'Test Market',
            description: 'Test Description',
            outcomes,
            resolutionDate: new Date(),
            volume24h: 1000,
            liquidity: 5000,
            url: 'https://example.com'
        } as UnifiedMarket;
    };

    test('should map explicit Yes/No outcomes', () => {
        const market = createMockMarket(['Yes', 'No']);
        addBinaryOutcomes(market);

        expect(market.yes?.label).toBe('Yes');
        expect(market.no?.label).toBe('No');
    });

    test('should map explicit Up/Down outcomes', () => {
        const market = createMockMarket(['Up', 'Down']);
        addBinaryOutcomes(market);

        expect(market.up?.label).toBe('Up');
        expect(market.down?.label).toBe('Down');
        expect(market.yes?.label).toBe('Up');
        expect(market.no?.label).toBe('Down');
    });

    test('should map "Not" patterns correctly', () => {
        const market = createMockMarket(['Kevin Warsh', 'Not Kevin Warsh']);
        addBinaryOutcomes(market);

        expect(market.yes?.label).toBe('Kevin Warsh');
        expect(market.no?.label).toBe('Not Kevin Warsh');
    });

    test('should handle reversed order correctly', () => {
        const market = createMockMarket(['No', 'Yes']);
        addBinaryOutcomes(market);

        expect(market.yes?.label).toBe('Yes');
        expect(market.no?.label).toBe('No');
    });

    test('should handle reversed "Not" order correctly', () => {
        const market = createMockMarket(['Not Trump', 'Trump']);
        addBinaryOutcomes(market);

        expect(market.yes?.label).toBe('Trump');
        expect(market.no?.label).toBe('Not Trump');
    });

    test('should map Over/Under correctly', () => {
        const market = createMockMarket(['Over 2.5', 'Under 2.5']);
        addBinaryOutcomes(market);

        expect(market.yes?.label).toBe('Over 2.5');
        expect(market.no?.label).toBe('Under 2.5');
    });

    test('should do nothing for non-binary markets', () => {
        const market = createMockMarket(['Home', 'Away', 'Draw']);
        addBinaryOutcomes(market);

        expect(market.yes).toBeUndefined();
        expect(market.no).toBeUndefined();
    });

    test('should fallback to first index if "Not" cannot be determined', () => {
        // Obscure labels that don't match any patterns
        const market = createMockMarket(['Alpha', 'Beta']);
        addBinaryOutcomes(market);

        expect(market.yes?.label).toBe('Alpha');
        expect(market.no?.label).toBe('Beta');
    });
});

describe('deduplicateMarkets', () => {
    const createMarket = (id: string, title: string): UnifiedMarket => ({
        marketId: id,
        title,
        description: '',
        outcomes: [],
        resolutionDate: new Date(),
        volume24h: 0,
        liquidity: 0,
        url: `https://example.com/${id}`,
    } as UnifiedMarket);

    test('should prepend exact matches before search results', () => {
        const exact = [createMarket('A', 'Exact A')];
        const search = [createMarket('B', 'Search B'), createMarket('C', 'Search C')];

        const result = deduplicateMarkets(exact, search);

        expect(result).toHaveLength(3);
        expect(result[0].marketId).toBe('A');
        expect(result[1].marketId).toBe('B');
        expect(result[2].marketId).toBe('C');
    });

    test('should deduplicate when exact match also appears in search results', () => {
        const exact = [createMarket('A', 'Exact A')];
        const search = [createMarket('A', 'Search A'), createMarket('B', 'Search B')];

        const result = deduplicateMarkets(exact, search);

        expect(result).toHaveLength(2);
        expect(result[0].marketId).toBe('A');
        expect(result[0].title).toBe('Exact A'); // Exact version is kept
        expect(result[1].marketId).toBe('B');
    });

    test('should return only search results when no exact matches', () => {
        const search = [createMarket('A', 'A'), createMarket('B', 'B')];

        const result = deduplicateMarkets([], search);

        expect(result).toHaveLength(2);
        expect(result[0].marketId).toBe('A');
    });

    test('should return only exact matches when no search results', () => {
        const exact = [createMarket('A', 'A')];

        const result = deduplicateMarkets(exact, []);

        expect(result).toHaveLength(1);
        expect(result[0].marketId).toBe('A');
    });

    test('should return empty array when both inputs are empty', () => {
        const result = deduplicateMarkets([], []);
        expect(result).toHaveLength(0);
    });

    test('should handle multiple exact matches with deduplication', () => {
        const exact = [createMarket('A', 'Exact A'), createMarket('B', 'Exact B')];
        const search = [createMarket('B', 'Search B'), createMarket('C', 'Search C'), createMarket('A', 'Search A')];

        const result = deduplicateMarkets(exact, search);

        expect(result).toHaveLength(3);
        expect(result[0].marketId).toBe('A');
        expect(result[1].marketId).toBe('B');
        expect(result[2].marketId).toBe('C');
    });
});
