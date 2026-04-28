import pmxt

router = pmxt.Router(pmxt_api_key="pmxt_d4b072cf2510c02d04b18396108cbfcb0903db2812b4c9027a5b4b48b113808b")

# 1. Find the FIFA World Cup winner event on Polymarket
events = router.fetch_events(query="fifa world cup winner", limit=5)
event = [e for e in events if e.source_exchange == "polymarket"][0]
print(f"{event.title} on {event.source_exchange}")
print(f"URL: {event.url}")
print(f"{len(event.markets)} markets")

# 2. Find identical events on other venues
matches = router.fetch_event_matches(event_id=event.id, include_prices=True)
for match in matches:
    print(f"\n{match.event.title} on {match.event.source_exchange}")
    print(f"  URL: {match.event.url}")
    print(f"  {len(match.market_matches)} matched markets:")
    for mm in match.market_matches:
        print(f"    [{mm.relation} {mm.confidence:.0%}] {mm.market.title[:40]:40s} @ {mm.market.yes.price}")
