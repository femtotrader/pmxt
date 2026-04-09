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

    test('never leaks a candidate name when every market has a distinct template', () => {
        const event: KalshiRawEvent = {
            event_ticker: 'KXDISTINCT',
            title: 'Distinct dates per market',
            markets: [
                makeMarket({
                    ticker: 'KXDISTINCT-A',
                    yes_sub_title: 'Alice',
                    rules_primary: 'If Alice wins by Jan 1, 2026, then the market resolves to Yes.',
                }),
                makeMarket({
                    ticker: 'KXDISTINCT-B',
                    yes_sub_title: 'Bob',
                    rules_primary: 'If Bob wins by Feb 1, 2026, then the market resolves to Yes.',
                }),
                makeMarket({
                    ticker: 'KXDISTINCT-C',
                    yes_sub_title: 'Carol',
                    rules_primary: 'If Carol wins by Mar 1, 2026, then the market resolves to Yes.',
                }),
            ],
        };

        const unifiedEvent = normalizer.normalizeEvent(event)!;
        expect(unifiedEvent.description).toContain('{x}');
        expect(unifiedEvent.description).not.toContain('Alice');
        expect(unifiedEvent.description).not.toContain('Bob');
        expect(unifiedEvent.description).not.toContain('Carol');
    });

    test('templates non-ASCII candidate names', () => {
        const event: KalshiRawEvent = {
            event_ticker: 'KXUNICODE',
            title: 'Unicode candidate names',
            markets: [
                makeMarket({
                    ticker: 'KXUNICODE-J',
                    yes_sub_title: 'Jose Munoz',
                    rules_primary: 'If Jose Munoz is elected, then the market resolves to Yes.',
                }),
                makeMarket({
                    ticker: 'KXUNICODE-M',
                    yes_sub_title: 'Muller',
                    rules_primary: 'If Muller is elected, then the market resolves to Yes.',
                }),
            ],
        };

        const unifiedEvent = normalizer.normalizeEvent(event)!;
        expect(unifiedEvent.description).toContain('{x}');
        expect(unifiedEvent.description).not.toContain('Jose');
        expect(unifiedEvent.description).not.toContain('Muller');
    });
});
