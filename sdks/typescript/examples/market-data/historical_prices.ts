import pmxt from 'pmxtjs';

const main = async () => {
    const api = new pmxt.Polymarket();
    const markets = await api.getMarketsBySlug('who-will-trump-nominate-as-fed-chair');
    const warsh = markets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');

    if (warsh && warsh.outcomes && warsh.outcomes[0]) {
        const history = await api.fetchOHLCV(warsh.outcomes[0].metadata.clobTokenId, {
            resolution: '1h',
            limit: 5
        });

        console.log(history);
    }
};

main();
