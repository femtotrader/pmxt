import pmxt from '../../src';

async function run() {
    const api = new pmxt.polymarket();

    // Search for the Rick Rieder market
    const markets = await api.searchMarkets('Rick Rieder');
    const market = markets.find(m => m.title.includes('Rick Rieder') && m.title.includes('Fed'));

    if (!market) {
        console.error('Market not found');
        return;
    }

    const outcome = market.outcomes[0]; // YES outcome
    const assetId = outcome.id;

    console.log(`Watching trades for: ${market.title}`);
    console.log(`Outcome: ${outcome.label} (Asset ID: ${assetId})\n`);

    while (true) {
        const trades = await api.watchTrades(assetId);
        for (const trade of trades) {
            console.log(`[TRADE] ${trade.side.toUpperCase().padStart(4)} | ${trade.amount.toLocaleString().padStart(10)} shares @ $${trade.price.toFixed(3)} | ${new Date(trade.timestamp).toLocaleTimeString()}`);
        }
    }
}

run().catch(console.error);
