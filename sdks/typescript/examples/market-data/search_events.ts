import pmxt from 'pmxtjs';

const main = async () => {
    const poly = new pmxt.Polymarket();
    const kalshi = new pmxt.Kalshi();

    console.log('Polymarket:', await poly.searchMarkets('Trump'));
    console.log('Kalshi:', await kalshi.searchMarkets('Trump'));
};

main();
