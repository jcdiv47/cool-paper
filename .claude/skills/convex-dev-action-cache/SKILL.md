---
name: convex-dev-action-cache
description: Cache expensive action results like AI API calls in Convex with configurable TTL to reduce latency and API costs. Use when working with backend features, Action Cache.
---

# Action Cache

## Instructions

Action Cache is a Convex component that provides cache expensive action results like ai api calls in convex with configurable ttl to reduce latency and api costs.

### Installation

```bash
npm install @convex-dev/action-cache
```

### Capabilities

- Reduce API costs by caching expensive AI and third-party service calls
- Improve response times by serving cached results instead of repeating slow operations
- Control cache behavior with configurable expiration times and invalidation strategies
- Seamlessly integrate caching into existing Convex actions without refactoring

## Examples

### how to cache AI API calls in Convex actions

Action Cache wraps your expensive AI calls with automatic caching based on input parameters. Results are stored with configurable TTL, so identical requests return instantly from cache instead of hitting the AI API again.

### reduce OpenAI API costs in Convex backend

Use Action Cache to store OpenAI responses and avoid duplicate API calls for the same inputs. The component automatically handles cache keys and expiration, significantly reducing your AI API usage and costs.

### cache third party API responses Convex

Action Cache stores results from external APIs like payment processors or data services. Configure cache duration based on how frequently the external data changes to balance freshness with performance.

## Troubleshooting

**How does Action Cache determine when to return cached vs fresh results?**

Action Cache uses input parameters as cache keys and respects the TTL you configure. If cached data exists and hasn't expired, it returns immediately. Otherwise, it executes your action and caches the new result for subsequent calls.

**Can I manually invalidate cached results before they expire?**

Yes, Action Cache provides methods to manually clear specific cache entries or entire cache namespaces. This is useful when you know external data has changed and want to force fresh API calls.

**What happens if my cached action throws an error?**

Action Cache only stores successful results. If your action throws an error, the error propagates normally and no cache entry is created, ensuring failed operations don't prevent retries.

**How much data can Action Cache store?**

Action Cache uses Convex's database for storage, so it's limited by your Convex plan's database size. The component is designed for caching API responses and computed results, not large files or datasets.

## Resources

- [npm package](https://www.npmjs.com/package/%40convex-dev%2Faction-cache)
- [GitHub repository](https://github.com/get-convex/action-cache)
- [Convex Components Directory](https://www.convex.dev/components/action-cache)
- [Convex documentation](https://docs.convex.dev)
