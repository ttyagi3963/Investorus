# 0014. Make every request traceable, and keep personal details out of logs

## Status
Accepted, 2026-11-01. Deciders: Tarun (owner), Claude.

## Context
- One user action crosses four processes: the browser, the Next.js BFF, the api, and the worker's
  jobs and deliveries. Support needs to follow it from one ID.
- The first support question in a marketplace is "why didn't investor X get this listing?".
  FR-074 asks for an answer with evidence.
- Constitution VII and XII: structured logging, and error reporting only at the translators'
  unexpected-error branches; no scattered `console.error`; seller PII redacted from logs and error
  reports (XX.1).
- No outside accounts are allowed, so no hosted APM or Sentry project.
- The first plan passed a custom `X-Request-Id` by hand. The owner replaced it on 2026-11-01:
  hand-passing an ID always misses a path.

## Decision
We will carry one W3C trace ID through every hop in a request context, log structured JSON with
redaction, and give operations a trace built from data the system already writes:
1. **One ID, the standard header.** The BFF keeps the trace ID of a valid incoming `traceparent` or
   creates one, and sends `traceparent` to the api on every call (T283).
2. **A context, not parameters.** The api's first middleware runs the request inside an
   `AsyncLocalStorage` trace context. pino's `mixin` adds `trace_id` to every line from any layer;
   the audit log and the job and outbox tables store it as `correlationId`.
3. **Quotable.** Every error body carries `requestId` and every response `X-Request-Id`, which the
   BFF passes back.
4. **Jobs keep it.** The worker runs each job inside the trace of the request that queued it
   (T294, ADR 0010), so one ID finds the request and its background work.
5. **Redaction in the logger, errors through a port.** What is redacted, and where, is set by
   ADR 0013. Unexpected errors go to an `IErrorReporter` port; `LogErrorReporterImpl` writes them
   to the log until Sentry is allowed.
6. **Operations see the story.** The console's package trace shows counts, matched and unmatched
   investors, offers, and a timeline of audit entries and deliveries. "Why?" returns the stored
   match decision, or replays a non-match against the listing and buy box versions live at
   matching time, criterion by criterion (T341, T383; ADR 0016).

## Alternatives considered
- **Plain `console` logs:** unsearchable, no trace ID, and no redaction; VII forbids scattered
  `console.error`.
- **A vendor APM from day one (Datadog, hosted Sentry):** needs an outside account, which the brief
  forbids. `traceparent` and `AsyncLocalStorage` are what the OpenTelemetry SDK uses, so adding it
  later reuses the same header and ID.
- **A custom `X-Request-Id` passed by hand:** the first plan; replaced because every layer must
  remember it, and proxies and APM tools do not understand it.

## Consequences
- **Positive:** tests prove the ID survives Express's JSON body parser (where context usually
  breaks), the BFF forwards or creates it, and errors return it.
- **Positive:** "why not matched" is answered with evidence, and a CRM outage ends with one "Retry
  all" in the console, not a database script.
- **Negative:** no spans, timings, metrics, or dashboards: a trace ID in logs only (a recorded
  prototype shortcut). Production adds the OpenTelemetry SDK and Prometheus with Grafana.
- **Negative:** deliveries do not run inside the trace. The outbox event stores the trace ID, but
  the few delivery log lines (a delivery set aside, a final failure) carry `delivery_id` instead,
  so finding them takes one extra lookup.
- **Negative:** the replay uses the current evaluator code and flags `replayedWithNewerRules` when
  rules changed; old decisions do not replay exactly. The trace queries live data.
- **Revisit when:** outside accounts are allowed (add OpenTelemetry and Sentry behind the same
  context and port), or trace queries slow the primary database (move them to a replica or a
  projection).

## Evidence
- [trace-context.ts](../../packages/core/src/infra/trace-context.ts),
  [logger.ts](../../packages/core/src/infra/logger.ts),
  [trace.ts](../../apps/api/src/middleware/trace.ts),
  [apps/web/src/bff/shared.ts](../../apps/web/src/bff/shared.ts) (`traceparent`),
  [job-runner.ts](../../apps/worker/src/job-runner.ts),
  [OpsQueryService.ts](../../packages/core/src/services/ops/OpsQueryService.ts),
  [IErrorReporter.ts](../../packages/core/src/providers/error-reporter/IErrorReporter.ts),
  [app.test.ts](../../apps/api/src/app.test.ts) (the trace tests)
- [README.md Prototype Shortcuts](../../README.md#prototype-shortcuts) (tracing,
  `LogErrorReporterImpl`, the replay)
- Spec documents (available on request): constitution VII, XII, XX.1; research R17; tasks T282,
  T283, T294, T341, T361, T382, T383; tasks.md Sprint 2 decisions (tracing and audit first)
