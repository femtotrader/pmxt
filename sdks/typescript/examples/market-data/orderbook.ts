import pmxt from 'pmxtjs';

const main = async () => {
    const api = new pmxt.Kalshi();
    const markets = await api.getMarketsBySlug('KXFEDCHAIRNOM-29');
    const warsh = markets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');

    const book = await api.fetchOrderBook(warsh!.id);

    console.log(book);
};

main();
