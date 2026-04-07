import { describe, expect, test } from '@jest/globals';
import { KalshiNormalizer } from '../../../src/exchanges/kalshi/normalizer';
import { KalshiRawEvent, KalshiRawMarket } from '../../../src/exchanges/kalshi/fetcher';

const normalizer = new KalshiNormalizer();

function makeMarket(overrides: Partial<KalshiRawMarket>): KalshiRawMarket {
    return {
        ticker: 'KALSHI-MKT',
        expiration_time: '2029-01-20T15:00:00Z',
        ...overrides,
    };
}

describe('KalshiNormalizer outcome labels', () => {
    test('prefers yes_sub_title over structural subtitle values', () => {
        const event: KalshiRawEvent = {
            event_ticker: 'KXGOVCA-26',
            title: 'California Governor winner? (Person)',
            markets: [
                makeMarket({
                    ticker: 'KXGOVCA-26-TATK',
                    subtitle: ':: Democratic',
                    yes_sub_title: 'Toni Atkins',
                    rules_primary: 'If Toni Atkins is elected, then the market resolves to Yes.',
                }),
            ],
        };

        const market = normalizer.normalizeMarketsFromEvent(event)[0];
        expect(market.outcomes[0].label).toBe('Toni Atkins');
        expect(market.outcomes[1].label).toBe('Not Toni Atkins');
    });
});

describe('KalshiNormalizer event description', () => {
    test('uses dominant template and avoids malformed suffix truncation', () => {
        const event: KalshiRawEvent = {
            event_ticker: 'KXCABOUT-26MAR',
            title: "Who will leave Trump's Cabinet next?",
            markets: [
                makeMarket({
                    ticker: 'KXCABOUT-26MAR-MRUB',
                    yes_sub_title: 'Marco Rubio',
                    rules_primary: 'If Marco Rubio is the first member of the Cabinet of Donald Trump to leave or announce they will leave (such as by quitting, being fired, or being impeached) after Mar 10, 2026, then the market resolves to Yes.',
                }),
                makeMarket({
                    ticker: 'KXCABOUT-26MAR-SBES',
                    yes_sub_title: 'Scott Bessent',
                    rules_primary: 'If Scott Bessent is the first member of the Cabinet of Donald Trump to leave or announce they will leave (such as by quitting, being fired, or being impeached) after Mar 10, 2026, then the market resolves to Yes.',
                }),
                makeMarket({
                    ticker: 'KXCABOUT-26MAR-MMUL',
                    yes_sub_title: 'Markwayne Mullin',
                    rules_primary: 'If Markwayne Mullin is the first member of the Cabinet of Donald Trump to leave or announce they will leave (such as by quitting, being fired, or being impeached) after Mar 30, 2026, then the market resolves to Yes.',
                }),
            ],
        };

        const unifiedEvent = normalizer.normalizeEvent(event)!;
        expect(unifiedEvent.description).toBe(
            'If {x} is the first member of the Cabinet of Donald Trump to leave or announce they will leave (such as by quitting, being fired, or being impeached) after Mar 10, 2026, then the market resolves to Yes.',
        );
        expect(unifiedEvent.description).not.toContain('{x}0, 2026');
    });
});
