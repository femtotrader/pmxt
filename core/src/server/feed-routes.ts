import { Router, Request, Response, NextFunction } from 'express';
import { getFeed, AVAILABLE_FEEDS } from './feed-factory';

/**
 * Express router for data feed endpoints — CCXT-compatible method names.
 * Mounts under `/api/feeds`.
 */
export function createFeedRouter(): Router {
    const router = Router();

    router.get('/', (_req: Request, res: Response) => {
        res.json({ success: true, data: AVAILABLE_FEEDS });
    });

    router.use('/:feed', (req: Request, _res: Response, next: NextFunction) => {
        try {
            const feed = getFeed(req.params.feed as string);
            (req as any)._feed = feed;
            next();
        } catch (error: any) {
            next(error);
        }
    });

    // GET /api/feeds/:feed/loadMarkets
    router.get('/:feed/loadMarkets', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = await (req as any)._feed.loadMarkets();
            res.json({ success: true, data });
        } catch (error) { next(error); }
    });

    // GET /api/feeds/:feed/fetchTicker?symbol=BTC/USD
    router.get('/:feed/fetchTicker', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const symbol = req.query.symbol as string;
            if (!symbol) {
                res.status(400).json({ success: false, error: 'Missing required parameter: symbol' });
                return;
            }
            const data = await (req as any)._feed.fetchTicker(symbol);
            res.json({ success: true, data });
        } catch (error) { next(error); }
    });

    // GET /api/feeds/:feed/fetchTickers?symbols=BTC/USD,ETH/USD
    router.get('/:feed/fetchTickers', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const symbolsRaw = req.query.symbols as string | undefined;
            const symbols = symbolsRaw ? symbolsRaw.split(',').map((s) => s.trim()) : undefined;
            const data = await (req as any)._feed.fetchTickers(symbols);
            res.json({ success: true, data });
        } catch (error) { next(error); }
    });

    // GET /api/feeds/:feed/fetchOHLCV?symbol=BTC/USDT&timeframe=1h&since=...&limit=...
    router.get('/:feed/fetchOHLCV', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const symbol = req.query.symbol as string;
            if (!symbol) {
                res.status(400).json({ success: false, error: 'Missing required parameter: symbol' });
                return;
            }
            const data = await (req as any)._feed.fetchOHLCV(
                symbol,
                (req.query.timeframe as string) || '1h',
                req.query.since ? Number(req.query.since) : undefined,
                req.query.limit ? Number(req.query.limit) : undefined,
            );
            res.json({ success: true, data });
        } catch (error) { next(error); }
    });

    // GET /api/feeds/:feed/fetchOrderBook?symbol=BTC/USDT&limit=20
    router.get('/:feed/fetchOrderBook', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const feed = (req as any)._feed;
            if (typeof feed.fetchOrderBook !== 'function') {
                res.status(501).json({ success: false, error: `Feed '${req.params.feed}' does not support fetchOrderBook` });
                return;
            }
            const symbol = req.query.symbol as string;
            if (!symbol) {
                res.status(400).json({ success: false, error: 'Missing required parameter: symbol' });
                return;
            }
            const data = await feed.fetchOrderBook(symbol, req.query.limit ? Number(req.query.limit) : undefined);
            res.json({ success: true, data });
        } catch (error) { next(error); }
    });

    // GET /api/feeds/:feed/fetchOracleRound?feed=BTC/USD
    router.get('/:feed/fetchOracleRound', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const feed = (req as any)._feed;
            if (typeof feed.fetchOracleRound !== 'function') {
                res.status(501).json({ success: false, error: `Feed '${req.params.feed}' does not support fetchOracleRound` });
                return;
            }
            const feedName = req.query.feed as string;
            if (!feedName) {
                res.status(400).json({ success: false, error: 'Missing required parameter: feed' });
                return;
            }
            const data = await feed.fetchOracleRound({ feed: feedName });
            res.json({ success: true, data });
        } catch (error) { next(error); }
    });

    // GET /api/feeds/:feed/fetchOracleHistory?feed=BTC/USD&limit=50
    router.get('/:feed/fetchOracleHistory', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const feed = (req as any)._feed;
            if (typeof feed.fetchOracleHistory !== 'function') {
                res.status(501).json({ success: false, error: `Feed '${req.params.feed}' does not support fetchOracleHistory` });
                return;
            }
            const feedName = req.query.feed as string;
            if (!feedName) {
                res.status(400).json({ success: false, error: 'Missing required parameter: feed' });
                return;
            }
            const data = await feed.fetchOracleHistory({
                feed: feedName,
                limit: req.query.limit ? Number(req.query.limit) : undefined,
            });
            res.json({ success: true, data });
        } catch (error) { next(error); }
    });

    // GET /api/feeds/:feed/fetchHistoricalPrices?symbol=BTC/USD&maxSize=10&order=desc
    router.get('/:feed/fetchHistoricalPrices', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const feed = (req as any)._feed;
            if (typeof feed.fetchHistoricalPrices !== 'function') {
                res.status(501).json({ success: false, error: `Feed '${req.params.feed}' does not support fetchHistoricalPrices` });
                return;
            }
            const symbol = req.query.symbol as string;
            if (!symbol) {
                res.status(400).json({ success: false, error: 'Missing required parameter: symbol' });
                return;
            }
            const data = await feed.fetchHistoricalPrices(symbol, {
                fromTimestamp: req.query.fromTimestamp ? Number(req.query.fromTimestamp) : undefined,
                untilTimestamp: req.query.untilTimestamp ? Number(req.query.untilTimestamp) : undefined,
                maxSize: req.query.maxSize ? Number(req.query.maxSize) : undefined,
                order: req.query.order as 'asc' | 'desc' | undefined,
            });
            res.json({ success: true, data });
        } catch (error) { next(error); }
    });

    return router;
}
