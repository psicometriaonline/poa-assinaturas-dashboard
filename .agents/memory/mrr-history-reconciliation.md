---
name: MRR history vs KPI reconciliation
description: How the revenue "Evolução do MRR" chart must reconcile with the "MRR Atual" KPI, and the decoupled money-vs-count model.
---

# MRR history reconciliation (revenue metric)

The "MRR Atual" KPI is a **snapshot**: SUM of MRR over `hotmart_subscriptions`
where `status='ACTIVE'`. The "Evolução do MRR" chart is a **cumulative
reconstruction** (Σ additions − Σ removals). For the chart's final point to
equal the KPI, three rules must hold:

- **Additions** = ALL subs by `accession_date` (do NOT filter by
  `original_event`). Filtering to IMPORT_CSV/PURCHASE_APPROVED/REACTIVATED only
  drops active subs acquired via PURCHASE_COMPLETE/DELAYED/CHARGEBACK and makes
  the curve undercount.
- **MRR removal (money out)** = from `hotmart_subscriptions` where
  `status<>'ACTIVE'` AND `accession_date` present, exit month =
  `cancellation_date` else `last_event_at`. This guarantees
  `SUM(added) − SUM(removed) == active MRR` exactly. Past-due/inactive are
  removed from MRR because they are not paying.
- **Cancellation COUNT** (`churnedSubs`/`churnRate`) must stay on the
  **webhook-event definition** (`CHURN_EVENTS`, same as `churn.ts`), NOT on
  `status<>'ACTIVE'`. Otherwise past-due gets mislabeled as a cancellation and
  diverges from the rest of the dashboard.

**Why:** money-out (paying vs not) and cancellation-count (hard churn) are
different concepts; conflating them either breaks MRR reconciliation or
mislabels churn.

**How to apply:** keep these as separate aggregations in `revenue.ts`. No
double-counting risk because `hotmart_subscriptions` is keyed
`ON CONFLICT(subscriber_code) DO UPDATE` (one row per subscriber;
`original_event`=first event seen, `last_event`=most recent).

**Verify against PRODUCTION** (dev DB has only test/IMPORT_CSV data and won't
match): cumulative final point should equal the live MRR snapshot. Known
residual breaker: subs with `status='ACTIVE'` but `accession_date IS NULL`
(0 in prod) are in the KPI snapshot but can't be placed on the timeline.
