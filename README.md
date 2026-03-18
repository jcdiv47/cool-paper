# cool-paper

## Getting Started

Run the web app:

```bash
npm run dev
```

Run the Convex backend in a second terminal:

```bash
npx convex dev
```

## OpenRouter

The app uses OpenRouter as its sole LLM provider. Set the required env var in the Convex runtime:

```bash
npx convex env set OPENROUTER_API_KEY <your-openrouter-api-key>
```

Optional model overrides (defaults are in `convex/lib/modelConfig.ts`):

```bash
npx convex env set MODEL_HAIKU anthropic/claude-haiku-4.5
```

The UI stores canonical OpenRouter model IDs. Runtime overrides only change the effective model used by Convex.

## Notes

- `OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_TITLE` are optional but recommended for OpenRouter analytics and ranking.
- See [docs/openrouter-claude-agent-sdk.md](docs/openrouter-claude-agent-sdk.md) for full configuration details.
