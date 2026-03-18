# OpenRouter Setup

This project uses OpenRouter as its sole LLM provider via the `@ai-sdk/openai` compatible client.

## Convex environment variables

Set these in the Convex runtime that executes `convex/actions/*`:

```bash
npx convex env set OPENROUTER_API_KEY <your-openrouter-api-key>
```

Optional — analytics headers recommended by OpenRouter:

```bash
npx convex env set OPENROUTER_HTTP_REFERER http://localhost:3000
npx convex env set OPENROUTER_APP_TITLE cool-paper
```

Optional — override the base URL (defaults to `https://openrouter.ai/api/v1`):

```bash
npx convex env set OPENROUTER_BASE_URL https://openrouter.ai/api/v1
```

## Model aliases

The UI exposes `haiku`, `sonnet`, and `opus` as aliases. Default model IDs are defined in `convex/lib/modelConfig.ts`. Override them at runtime without a redeploy:

```bash
npx convex env set MODEL_HAIKU anthropic/claude-haiku-4.5
npx convex env set MODEL_SONNET anthropic/claude-sonnet-4.6
npx convex env set MODEL_OPUS anthropic/claude-opus-4.6
```

If you pass a full OpenRouter model ID instead of an alias, the backend uses it directly.
