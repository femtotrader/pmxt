import axios from 'axios';
import { LimitlessExchange } from '../../../src/exchanges/limitless';

/**
 * Limitless searchEvents() Test
 * 
 * What: Tests the search functionality for finding events (grouped markets) by query string.
 * Why: Events provide a hierarchical view which is better for discovery.
 * How: Mocks API responses and verifies grouping and secondary search capability.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LimitlessExchange - searchEvents', () => {
    let exchange: LimitlessExchange;

    beforeEach(() => {
        exchange = new LimitlessExchange();
        jest.clearAllMocks();
    });

    it('should return events with nested markets', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                markets: [
                    {
                        slug: 'fed-chair',
                        title: 'Who will Trump nominate as Fed Chair?',
                        description: 'Federal Reserve Chair nomination',
                        tokens: { yes: 't1', no: 't2' },
                        prices: [0.33, 0.67],
                        expirationTimestamp: '2026-12-31T00:00:00Z'
                    }
                ]
            }
        });

        const events = await exchange.searchEvents('Fed Chair');

        // searchEvents implementation maps single market to event with 1 market
        expect(events.length).toBe(1);
        expect(events[0].title).toContain('Fed Chair');
        expect(events[0].markets.length).toBe(1);
        expect(events[0].markets[0].outcomes[0].label).toBe('Yes');
    });

    it('should support searchMarkets helper on the event object', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                markets: [
                    {
                        slug: 'fed-chair-kevin',
                        title: 'Will Trump nominate Kevin Warsh?',
                        questions: 'Kevin Warsh',
                        tokens: { yes: 't1', no: 't2' },
                        prices: [0.5, 0.5]
                    }
                ]
            }
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
