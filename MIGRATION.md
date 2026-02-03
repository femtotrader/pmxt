# Migration Guide

## Feb 3, 2026 - v1.5.8: Unified Filtering

### Change
Introduced dedicated `filter_markets()` and `filter_events()` methods to replace manual list filtering and unify searching.

### How to Migrate
Instead of manually filtering lists using list comprehensions or `filter()`, use the unified methods:

```python
# OLD
warsh = fed_event.search_markets('Kevin Warsh')[0]

# NEW
warsh = api.filter_markets(fed_event.markets, "Kevin Warsh")[0]
```

---

## Feb 2, 2026 - v1.5.8: Hybrid ID Properties

### Change
Introduced explicit `marketId` and `outcomeId` properties to replace the ambiguous `.id` property.

**IMPORTANT**: The deprecated `.id` fields still exist for backwards compatibility but will be removed in v2.0. Update your code now to use the new fields.

### How to Migrate
Update your code to use the specific identifiers:

*   **Markets**: Use `market.marketId` (TypeScript) or `market.market_id` (Python) instead of `market.id`
*   **Outcomes**: Use `outcome.outcomeId` (TypeScript) or `outcome.outcome_id` (Python) instead of `outcome.id`

**Python:**
```python
# OLD (deprecated, will be removed in v2.0)
await poly.fetch_order_book(outcome.id)

# NEW
await poly.fetch_order_book(outcome.outcome_id)
```

**TypeScript:**
```typescript
// OLD (deprecated, will be removed in v2.0)
await poly.fetchOrderBook(outcome.id)

// NEW
await poly.fetchOrderBook(outcome.outcomeId)
```
