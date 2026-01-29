import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';

/**
 * Kalshi searchEvents() Test
 * 
 * What: Tests the search functionality for finding grouped events on Kalshi.
 * Why: Kalshi naturally returns events, so we must verify we map them correctly.
 * How: Mocks Kalshi event/market structure and verifies the UnifiedEvent result.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KalshiExchange - searchEvents', () => {
    let exchange: KalshiExchange;

    beforeEach(() => {
        exchange = new KalshiExchange();
        jest.clearAllMocks();
    });

    it('should return events with nested markets', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                events: [
                    {
                        event_ticker: 'FED-NOM',
                        title: 'Who will be nominated as Fed Chair?',
                        markets: [
                            {
                                ticker: 'FED-25JAN29-WARSH',
                                subtitle: 'Kevin Warsh',
                                last_price: 33,
                                expiration_time: '2026-12-31T00:00:00Z'
                            }
                        ]
                    }
                ]
            }
        });

        const events = await exchange.searchEvents('Fed Chair');

        expect(events.length).toBe(1);
        expect(events[0].title).toContain('nominated');
        expect(events[0].markets.length).toBe(1);
        expect(events[0].markets[0].outcomes[0].label).toBe('Kevin Warsh');
    });

    it('should support searchMarkets helper on the event object', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                events: [
                    {
                        event_ticker: 'FED-NOM',
                        title: 'Fed Chair nomination',
                        markets: [
                            {
                                ticker: 'FED-WARSH',
                                subtitle: 'Kevin Warsh',
                                last_price: 33,
                                expiration_time: '2026-12-31T00:00:00Z'
                            }
                        ]
                    }
                ]
            }
        });

        const events = await exchange.searchEvents('Fed');
        const event = events[0];

        const filtered = event.searchMarkets('Kevin');
        expect(filtered.length).toBe(1);
        expect(filtered[0].outcomes[0].label).toBe('Kevin Warsh');
    });

    it('should handle API errors gracefully', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Kalshi Down'));
        const events = await exchange.searchEvents('Test');
        expect(events).toEqual([]);
    });
});
