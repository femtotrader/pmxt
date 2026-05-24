import fs from 'fs';
import path from 'path';

describe('Baozi WebSocket resolver queues', () => {
    it('does not rely on a non-null assertion when queueing order book watchers', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../src/exchanges/baozi/websocket.ts'),
            'utf8',
        );

        expect(source).not.toMatch(/orderBookResolvers\.get\([^)]*\)!/);
    });
});
