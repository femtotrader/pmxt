import pmxt from '../../src';

const main = async () => {
    const poly = new pmxt.polymarket();
    const kalshi = new pmxt.kalshi();

    console.log('Polymarket:', await poly.searchMarkets('Fed'));
    console.log('Kalshi:', await kalshi.searchMarkets('Fed'));
};

main();
