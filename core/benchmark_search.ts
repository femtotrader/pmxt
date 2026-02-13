import { PolymarketExchange } from './src/exchanges/polymarket';
import { KalshiExchange } from './src/exchanges/kalshi';
import { LimitlessExchange } from './src/exchanges/limitless';
import { performance } from 'perf_hooks';

// Search term for the benchmark
const SEARCH_TERM = "BTC";

async function runBenchmark() {
    console.log(`Starting Search Benchmark for term: "${SEARCH_TERM}"`);
    console.log(`====================================================\n`);

    const exchanges = [
        new PolymarketExchange(),
        new KalshiExchange(),
        new LimitlessExchange()
    ];

    const statuses = ['active', 'closed', 'all'] as const;
    const results: any[] = [];

    for (const exchange of exchanges) {
        console.log(`Testing ${exchange.name}...`);
        for (const status of statuses) {
            process.stdout.write(`  - Status: ${status.padEnd(8)} ... `);

            const start = performance.now();
            let count = 0;
            let error = null;

            try {
                const events = await exchange.fetchEvents({
                    query: SEARCH_TERM,
                    status: status,
                    limit: 10_000
                });
                count = events.length;
            } catch (e: any) {
                error = e.message;
            }

            const end = performance.now();
            const duration = Math.round(end - start);

            results.push({
                Exchange: exchange.name,
                Status: status,
                Results: error ? 'ERROR' : count,
                'Time (ms)': duration,
                Message: error || ''
            });

            console.log(`${error ? 'FAIL' : 'DONE'} in ${duration}ms (${count} results)`);
        }
        console.log(''); // Newline between exchanges
    }

    console.log('\n--- FINAL BENCHMARK SUMMARY ---');
    console.table(results.map(r => ({
        Exchange: r.Exchange,
        Status: r.Status,
        Results: r.Results,
        'Time (ms)': r['Time (ms)']
    })));

    // Print errors if any
    const errors = results.filter(r => r.Message);
    if (errors.length > 0) {
        console.log('\n--- ERROR DETAILS ---');
        errors.forEach(e => console.log(`[${e.Exchange} - ${e.Status}]: ${e.Message}`));
    }
}

runBenchmark().catch(error => {
    console.error('\nBenchmark failed with critical error:');
    console.error(error);
});
