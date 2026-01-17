import pmxt from '../../src';

const main = async () => {
    const poly = new pmxt.polymarket();
    const kalshi = new pmxt.kalshi();

    console.log('Polymarket:', await poly.searchMarkets('Trump'));
    console.log('Kalshi:', await kalshi.searchMarkets('Trump'));
};

main();
