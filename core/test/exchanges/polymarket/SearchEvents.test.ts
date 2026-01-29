import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket searchEvents() Test
 * 
 * What: Tests the search functionality for finding events (grouped markets) by query string.
 * Why: Events provide a hierarchical view which is better for discovery.
 * How: Mocks API responses and verifies grouping and secondary search capability.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - searchEvents', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    it('should return events with nested markets', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [
                {
                    id: 'event-1',
                    slug: 'fed-chair',
                    title: 'Who will Trump nominate as Fed Chair?',
                    description: 'Federal Reserve Chair nomination',
                    markets: [
                        {
                            id: 'market-1',
                            question: 'Will Trump nominate Kevin Warsh?',
                            groupItemTitle: 'Kevin Warsh',
                            outcomes: '["Yes", "No"]',
                            clobTokenIds: '["token1", "token2"]',
                            outcomePrices: '["0.33", "0.67"]',
                            endDate: '2026-12-31T00:00:00Z'
                        },
                        {
                            id: 'market-2',
                            question: 'Will Trump nominate Rick Rieder?',
                            groupItemTitle: 'Rick Rieder',
                            outcomes: '["Yes", "No"]',
                            clobTokenIds: '["token3", "token4"]',
                            outcomePrices: '["0.34", "0.66"]',
                            endDate: '2026-12-31T00:00:00Z'
                        }
                    ]
                }
            ]
        });

        const events = await exchange.searchEvents('Fed Chair');

        expect(events.length).toBe(1);
        expect(events[0].title).toContain('Fed Chair');
        expect(events[0].markets.length).toBe(2);
        expect(events[0].markets[0].outcomes[0].label).toBe('Kevin Warsh');
    });

    it('should support searchMarkets helper on the event object', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [
                {
                    id: 'event-1',
                    slug: 'fed-chair',
                    title: 'Who will Trump nominate as Fed Chair?',
                    markets: [
                        {
                            id: 'market-1',
                            question: 'Will Trump nominate Kevin Warsh?',
                            groupItemTitle: 'Kevin Warsh',
                            outcomes: '["Yes", "No"]',
                            clobTokenIds: '["token1", "token2"]',
                            outcomePrices: '["0.33", "0.67"]',
                            endDate: '2026-12-31T00:00:00Z'
                        }
                    ]
                }
            ]
        });

        const events = await exchange.searchEvents('Fed Chair');
        const fedEvent = events[0];

        const filtered = fedEvent.searchMarkets('Kevin');
        expect(filtered.length).toBe(1);
        expect(filtered[0].title).toContain('Kevin Warsh');
    });

    it('should respect limits and handle empty results', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] });
        const events = await exchange.searchEvents('Nonexistent');
        expect(events).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
        mockedAxios.get.mockRejectedValue(new Error('API Down'));
        const events = await exchange.searchEvents('Test');
        expect(events).toEqual([]);
    });
});
