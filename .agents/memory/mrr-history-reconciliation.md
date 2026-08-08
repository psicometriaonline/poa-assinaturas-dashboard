---
name: MRR history vs KPI reconciliation
description: How the revenue MRR chart must reconcile with the current-MRR KPI in the paid-only dashboard model
---

The dashboard was rewritten for a 100% paid model (no free trial, no leads/funnel/conversion). Superseded approach: cumulative add/remove MRR series.

Current rule: all subscription metrics come from `artifacts/api-server/src/lib/subscription-sql.ts`. Never write MRR/churn/active-subscriber SQL directly in a route or page. Time-sliced queries must read the `timeline` CTE, never `subs` directly (subs includes rows with unknown exit dates and inflates time series).

MRR is measured point-in-time; the last point of the series equals current MRR by construction. Churn denominator = active base at month start (higher rate than the old table-total denominator — that is correct). Subscriptions with no cancellation date are excluded from the time series and surfaced as a data-quality note, intentionally.

**Why:** the old dashboard showed three different churn rates on three screens because each screen recomputed its own SQL; and cumulative MRR using `last_event_at` (which gets NOW() on every event) created false steps.

**How to apply:** any new subscription metric goes through subscription-sql.ts; verify the MRR series endpoint's last point equals the KPI. Do NOT reintroduce free-trial/leads/funnel concepts or the deleted files (conversion.ts, leads.ts, plan-acquisition.ts, churn-events.ts, Funnel.tsx, Leads.tsx).
