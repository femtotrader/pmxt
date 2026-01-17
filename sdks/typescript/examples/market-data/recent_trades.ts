import pmxt from 'pmxtjs';

const main = async () => {
    // Kalshi
    const kalshi = new pmxt.Kalshi();
    const kMarkets = await kalshi.getMarketsBySlug('KXFEDCHAIRNOM-29');
    const kWarsh = kMarkets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');
    if (kWarsh) {
        const kTrades = await kalshi.fetchTrades(kWarsh.id, { limit: 10, resolution: '1m' });
        console.log('Kalshi:', kTrades);
    }

    // Polymarket
    const poly = new pmxt.Polymarket();
    const pMarkets = await poly.getMarketsBySlug('who-will-trump-nominate-as-fed-chair');
    const pWarsh = pMarkets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');
    if (pWarsh && pWarsh.outcomes[0]) {
        const pTrades = await poly.fetchTrades(pWarsh.outcomes[0].metadata.clobTokenId, { limit: 10, resolution: '1m' });
        console.log('Polymarket:', pTrades);
    }
};

main();