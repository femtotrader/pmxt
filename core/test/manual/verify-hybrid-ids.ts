/**
 * Manual verification script for hybrid ID implementation
 * Run with: npx tsx test/manual/verify-hybrid-ids.ts
 */

import dotenv from 'dotenv';
import { PolymarketExchange } from '../../src/exchanges/polymarket';

dotenv.config({ path: '../../.env' });

async function verifyHybridIds() {
    console.log('🧪 Verifying Hybrid ID Implementation\n');

    const poly = new PolymarketExchange();

    // Fetch a market
    console.log('1️⃣ Fetching markets from Polymarket...');
    const markets = await poly.fetchMarkets({ limit: 1 });
    const market = markets[0];

    if (!market) {
        console.error(' No markets found');
        return;
    }

    // Verify both properties exist and are equal
    console.log('\n2️⃣ Verifying UnifiedMarket properties:');
    console.log(`   market.id:       "${market.id}"`);
    console.log(`   market.marketId: "${market.marketId}"`);
    console.log(`   Both exist:    ${!!market.id && !!market.marketId}`);
    console.log(`   Values equal:  ${market.id === market.marketId}`);

    const outcome = market.outcomes[0];
    console.log('\n3️⃣ Verifying MarketOutcome properties:');
    console.log(`   outcome.id:        "${outcome.id}"`);
    console.log(`   outcome.outcomeId: "${outcome.outcomeId}"`);
    console.log(`   Both exist:     ${!!outcome.id && !!outcome.outcomeId}`);
    console.log(`   Values equal:   ${outcome.id === outcome.outcomeId}`);

    // Verify that using the wrong ID throws a helpful error
    console.log('\n4️⃣ Testing validation with wrong ID type:');
    try {
        // This should fail because market.id is a short numeric ID
        await poly.fetchOrderBook(market.id);
        console.log('    Should have thrown an error!');
    } catch (e: any) {
        console.log('   Error thrown as expected');
        console.log(`   📝 Error message: "${e.message}"`);
        const hasDeprecationHint = e.message.includes('deprecated: market.id') &&
            e.message.includes('use: market.marketId') &&
            e.message.includes('preferred: outcome.outcomeId');
        console.log(`   Contains deprecation hints: ${hasDeprecationHint}`);
    }

    // Verify that using the correct ID works
    console.log('\n5️⃣ Testing with correct ID:');
    try {
        const orderBook = await poly.fetchOrderBook(outcome.outcomeId);
        console.log('   fetchOrderBook succeeded with outcome.outcomeId');
        console.log(`   📊 Orderbook has ${orderBook.bids.length} bids, ${orderBook.asks.length} asks`);
    } catch (e: any) {
        console.log(`    Unexpected error: ${e.message}`);
    }

    console.log('\n✨ Verification complete!\n');
}

verifyHybridIds().catch(console.error);
