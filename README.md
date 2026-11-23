# Evidence AI V2

A zero-budget Cloudflare Pages MVP for Investigate, Compare, and Debate.

## Upload structure
Upload every file and folder exactly as provided to the GitHub repository root.

## Required Cloudflare settings
In Cloudflare Pages > Settings > Variables and Secrets:
- `GROQ_API_KEY` as an encrypted secret (recommended primary provider)
- `GEMINI_API_KEY` as an encrypted secret (optional fallback)

In Cloudflare Pages > Settings > Functions > KV namespace bindings:
- Variable name: `RATE_LIMIT`
- Bind it to your existing KV namespace

## Deployment
1. Replace the current repository files with this package.
2. Commit the changes to the branch connected to Cloudflare Pages.
3. Cloudflare Pages will deploy automatically.
4. Test the homepage and submit one question in each mode.

## Important product limitation
This beta does not yet perform live web or academic-database retrieval for general questions. It clearly labels outputs as research starting points. Do not advertise it as a real-time fact checker until retrieval and citation verification are added.

## Files intentionally removed
- `rate-test.js`: it should not be public in production.
- Old DOJ-dominant homepage: DOJ should return later as one evidence-source connector, not the product identity.
- `support.html`: payments are not part of this first V2 release.

## Rollback
Before replacing your repository, download or duplicate the current repository so you can restore the old version if needed.
