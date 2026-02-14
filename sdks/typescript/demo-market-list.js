/**
 * Manual demo script to test MarketList.match() functionality.
 *
 * Usage:
 *   node demo-market-list.js
 */

const { Polymarket, MarketList } = require('./dist/index.js');

async function main() {
    const polymarket = new Polymarket();

    console.log('Fetching markets from Polymarket...\n');
    const markets = await polymarket.fetchMarkets({ limit: 100 });

    console.log(`Fetched ${markets.length} markets`);
    console.log('\n=== Demo 1: Filter for Oscars/Best Picture markets ===\n');

    // Filter for Oscars-related markets
    const oscarsMarkets = markets.filter(m =>
        m.title.toLowerCase().includes('oscars') ||
        m.title.toLowerCase().includes('best picture')
    );

    console.log(`Found ${oscarsMarkets.length} markets related to Oscars/Best Picture`);

    if (oscarsMarkets.length > 0) {
        console.log('Titles:');
        oscarsMarkets.slice(0, 10).forEach((m, i) => {
            console.log(`  ${i + 1}. ${m.title.substring(0, 70)}`);
        });

        // Convert to MarketList to test match() method
        const marketList = new MarketList(...oscarsMarkets);

        console.log('\n=== Demo 2: Using marketList.match() ===\n');

        // Try to find "One Battle" if it exists
        try {
            const match = marketList.match('One Battle');
            console.log(`✓ Found market: "${match.title}"`);
            console.log(`  Market ID: ${match.marketId}`);
            console.log(`  Volume 24h: $${match.volume24h}`);
        } catch (e) {
            console.log(`✗ Match for 'One Battle' failed: ${e.message}`);
        }

        console.log('\n=== Demo 3: Case-insensitive search ===\n');

        try {
            const match = marketList.match('one battle');
            console.log(`✓ Found market (case-insensitive): "${match.title}"`);
        } catch (e) {
            console.log(`✗ Match failed: ${e.message}`);
        }

        console.log('\n=== Demo 4: Ambiguous search (should fail with multiple matches) ===\n');

        try {
            const match = marketList.match('Best');
            console.log(`✓ Found market: "${match.title}"`);
        } catch (e) {
            console.log(`✗ Expected error (multiple matches): ${e.message}\n`);
        }

        console.log('\n=== Demo 5: Array methods still work ===\n');

        console.log(`marketList[0].title: "${marketList[0].title.substring(0, 50)}..."`);
        console.log(`marketList.length: ${marketList.length}`);
        console.log(`Mapped titles (first 3): ${marketList.slice(0, 3).map(m => m.title.substring(0, 25)).join(', ')}`);
    } else {
        console.log('\nNo Oscars-related markets found. Demonstrating with first 10 markets...');

        const marketList = new MarketList(...markets.slice(0, 10));

        console.log(`\nMarketList with first 10 markets:`);
        console.log('Titles:');
        marketList.forEach((m, i) => {
            console.log(`  ${i + 1}. ${m.title.substring(0, 50)}`);
        });

        console.log('\n=== Testing match() on random markets ===\n');

        try {
            const firstWord = marketList[0].title.split(' ')[0];
            const match = marketList.match(firstWord);
            console.log(`✓ Found match for "${firstWord}": "${match.title.substring(0, 60)}..."`);
        } catch (e) {
            console.log(`✗ Match failed: ${e.message}`);
        }

        console.log('\n=== Testing ambiguous match ===\n');

        try {
            // Try a very short query that might match multiple
            const match = marketList.match('Will');
            console.log(`✓ Found match: "${match.title}"`);
        } catch (e) {
            console.log(`✗ Expected error (likely multiple matches): ${e.message}\n`);
        }
    }

    console.log('\n=== All demos completed ===\n');
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
