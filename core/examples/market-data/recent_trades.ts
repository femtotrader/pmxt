import pmxt from '../../src';

const main = async () => {
    // Kalshi
    const kalshi = new pmxt.kalshi();
    const kMarkets = await kalshi.getMarketsBySlug('KXFEDCHAIRNOM-29');
    const kWarsh = kMarkets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');
    const kTrades = await kalshi.fetchTrades(kWarsh!.id, { limit: 10 });
    console.log('Kalshi:', kTrades);

    // Polymarket
    const poly = new pmxt.polymarket();
    const pMarkets = await poly.getMarketsBySlug('who-will-trump-nominate-as-fed-chair');
    const pWarsh = pMarkets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');
    const pTrades = await poly.fetchTrades(pWarsh!.outcomes[0].metadata.clobTokenId, { limit: 10 });
    console.log('Polymarket:', pTrades);
};

main();