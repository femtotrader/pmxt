import { PolymarketExchange } from './src/exchanges/polymarket';

async function test() {
    const api = new PolymarketExchange();

    try {
        const events = await api.fetchEvents({ query: 'Trump' });
        console.log(`Found ${events.length} events`);
        events.forEach(e => {
            console.log(`- Event: ${e.title} (ID: ${e.id})`);
            console.log(`  Markets: ${e.markets.length}`);
        });
    } catch (e) {
        console.error('fetchEvents failed:', e);
    }

    console.log('\nTesting fetchMarkets with query: "Fed"');
    try {
        const markets = await api.fetchMarkets({ query: 'Fed' });
        console.log(`Found ${markets.length} markets with "Fed" in the title`);
        console.log('Sample markets:');
        markets.slice(0, 5).forEach(m => {
            console.log(`- ${m.title}`);
        });
    } catch (e) {
        console.error('fetchMarkets failed:', e);
    }
}

test();
