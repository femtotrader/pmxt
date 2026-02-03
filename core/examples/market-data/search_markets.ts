import pmxt from '../../src';

const main = async () => {
    const poly = new pmxt.Polymarket();
    const kalshi = new pmxt.Kalshi();

    console.log('Polymarket:', await poly.searchMarkets('Fed'));
    console.log('Kalshi:', await kalshi.searchMarkets('Fed'));
};

main();
