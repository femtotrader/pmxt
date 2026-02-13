import axios from 'axios';

const GAMMA_SEARCH_URL = 'https://gamma-api.polymarket.com/public-search';
const SEARCH_TERM = 'Trump';

async function verifyPolymarketStatus() {
    console.log(`Verifying Polymarket API status filters for term: "${SEARCH_TERM}"\n`);

    // Fetch active events
    const activeResponse = await axios.get(GAMMA_SEARCH_URL, {
        params: {
            q: SEARCH_TERM,
            limit_per_type: 50,
            events_status: 'active',
            page: 1
        }
    });

    // Fetch closed events
    const closedResponse = await axios.get(GAMMA_SEARCH_URL, {
        params: {
            q: SEARCH_TERM,
            limit_per_type: 50,
            events_status: 'closed',
            page: 1
        }
    });

    const activeEvents = activeResponse.data.events || [];
    const closedEvents = closedResponse.data.events || [];

    console.log(`Active events returned: ${activeEvents.length}`);
    console.log(`Closed events returned: ${closedEvents.length}`);

    // Check for overlap
    const activeIds = new Set(activeEvents.map((e: any) => e.id || e.slug));
    const closedIds = new Set(closedEvents.map((e: any) => e.id || e.slug));

    const overlap = [...activeIds].filter(id => closedIds.has(id));

    console.log(`\nOverlapping event IDs: ${overlap.length}`);
    if (overlap.length > 0) {
        console.log(`PROBLEM: ${overlap.length} events appear in BOTH active and closed!`);
        console.log('\nFirst 5 overlapping events:');
        overlap.slice(0, 5).forEach(id => {
            const activeEvent = activeEvents.find((e: any) => (e.id || e.slug) === id);
            const closedEvent = closedEvents.find((e: any) => (e.id || e.slug) === id);
            console.log(`\n  ID: ${id}`);
            console.log(`    Title: ${activeEvent?.title}`);
            console.log(`    In active response: ${activeEvent ? 'YES' : 'NO'}`);
            console.log(`    In closed response: ${closedEvent ? 'YES' : 'NO'}`);
            console.log(`    Active status: ${activeEvent?.active}`);
            console.log(`    Closed status: ${activeEvent?.closed}`);
        });
    } else {
        console.log('GOOD: No overlap between active and closed events');
    }

    console.log(`\nTotal unique events: ${new Set([...activeIds, ...closedIds]).size}`);
    console.log(`Expected if no overlap: ${activeIds.size + closedIds.size}`);
}

verifyPolymarketStatus().catch(error => {
    console.error('Verification failed:');
    console.error(error);
});
