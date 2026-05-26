import { BigNumber } from 'ethers';
import { scaledIntegerToNumber } from '../../src/exchanges/limitless/utils';

describe('Limitless balance conversion', () => {
    test('scales raw integer balances before converting to number', () => {
        const raw = 9007199254740993n;
        const legacy = parseFloat(raw.toString()) / 1_000_000;

        expect(legacy).toBe(9007199254.740992);
        expect(scaledIntegerToNumber(raw, 6)).toBe(9007199254.740993);
    });

    test('accepts ethers BigNumber balances without formatUnits parsing', () => {
        const raw = BigNumber.from('1234567890123');

        expect(scaledIntegerToNumber(raw, 6)).toBe(1234567.890123);
    });
});
