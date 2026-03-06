# Implementation Notes (X-only)

## Current architecture

- Source: Apify X actor
- Processing: normalize -> target match -> balance -> prompt
- Summarization: OpenAI Responses API
- Delivery: SMTP HTML email

## Scheduling

- Vercel cron: `0 2 * * *`
- GitHub Actions cron: `0 2 * * *`

## Removed scope

Weibo ingestion has been fully removed from the runtime path and workflow env surface.
