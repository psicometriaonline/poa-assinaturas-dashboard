import { query } from "../lib/db";
import {
  getListContacts,
  getContactUtmField,
  isActiveCampaignConfigured,
  MEMBERS_LIST_ID,
  UTM_FIELD_IDS,
} from "../sources/activecampaign";
import { BASE_CTES, formatMonthKey, num, pct, round2 } from "../lib/subscription-sql";
import { logger } from "../lib/logger";

const NO_SOURCE = "(direto)";
const NO_VALUE = "(nenhum)";

export interface AcquisitionMetrics {
  /** Paid subscriptions started inside the window. */
  totalSubscriptions: number;
  /** Of those, how many could be matched to a contact carrying UTM data. */
  attributed: number;
  attributionRate: number;
  mrrAttributed: number;
  /** Whether ActiveCampaign is reachable — the UI degrades instead of erroring. */
  available: boolean;
  months: string[];
  monthLabels: string[];
  bySource: Array<{
    source: string;
    subscribers: number;
    mrr: number;
    percentage: number;
    byMonth: Record<string, number>;
    mediums: Array<{
      medium: string;
      subscribers: number;
      mrr: number;
      byMonth: Record<string, number>;
      campaigns: Array<{
        campaign: string;
        subscribers: number;
        mrr: number;
        byMonth: Record<string, number>;
      }>;
    }>;
  }>;
}

interface SubRow {
  email: string;
  month_key: string;
  mrr: string;
}

function emptyResult(available: boolean, total = 0): AcquisitionMetrics {
  return {
    totalSubscriptions: total,
    attributed: 0,
    attributionRate: 0,
    mrrAttributed: 0,
    available,
    months: [],
    monthLabels: [],
    bySource: [],
  };
}

/**
 * Marketing origin of *paying* subscriptions.
 *
 * The old version of this metric measured free-trial sign-ups. It now joins the
 * subscriptions that actually started in the window against the UTM fields on
 * the matching ActiveCampaign contact, so every number on this page is money,
 * not registrations.
 */
export async function getAcquisitionMetrics(
  startDate: Date,
  endDate: Date
): Promise<AcquisitionMetrics> {
  const subRows = await query<SubRow>(
    `WITH ${BASE_CTES}
     SELECT
       email,
       to_char(date_trunc('month', started_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS month_key,
       mrr::text AS mrr
     FROM timeline
     WHERE started_at >= $1::timestamptz
       AND started_at <= $2::timestamptz
       AND email <> ''`,
    [startDate.toISOString(), endDate.toISOString()]
  );

  if (!isActiveCampaignConfigured()) {
    return emptyResult(false, subRows.length);
  }

  let contacts;
  try {
    contacts = await getListContacts(MEMBERS_LIST_ID);
  } catch (err) {
    logger.error({ err }, "Acquisition: ActiveCampaign unavailable, skipping attribution");
    return emptyResult(false, subRows.length);
  }

  const utmByEmail = new Map<string, { source: string; medium: string; campaign: string }>();
  for (const contact of contacts) {
    const email = contact.email?.toLowerCase().trim();
    if (!email) continue;
    utmByEmail.set(email, {
      source: getContactUtmField(contact, UTM_FIELD_IDS.source) || NO_SOURCE,
      medium: getContactUtmField(contact, UTM_FIELD_IDS.medium) || NO_VALUE,
      campaign: getContactUtmField(contact, UTM_FIELD_IDS.campaign) || NO_VALUE,
    });
  }

  interface Agg {
    subscribers: number;
    mrr: number;
    byMonth: Record<string, number>;
    children: Map<string, Agg>;
  }
  const newAgg = (): Agg => ({ subscribers: 0, mrr: 0, byMonth: {}, children: new Map() });

  const bump = (agg: Agg, monthKey: string, mrr: number) => {
    agg.subscribers++;
    agg.mrr += mrr;
    agg.byMonth[monthKey] = (agg.byMonth[monthKey] ?? 0) + 1;
  };

  const root = new Map<string, Agg>();
  const monthKeys = new Set<string>();
  let attributed = 0;
  let mrrAttributed = 0;

  for (const row of subRows) {
    const utm = utmByEmail.get(row.email);
    if (!utm) continue;

    const mrr = num(row.mrr);
    attributed++;
    mrrAttributed += mrr;
    monthKeys.add(row.month_key);

    const source = root.get(utm.source) ?? newAgg();
    root.set(utm.source, source);
    bump(source, row.month_key, mrr);

    const medium = source.children.get(utm.medium) ?? newAgg();
    source.children.set(utm.medium, medium);
    bump(medium, row.month_key, mrr);

    const campaign = medium.children.get(utm.campaign) ?? newAgg();
    medium.children.set(utm.campaign, campaign);
    bump(campaign, row.month_key, mrr);
  }

  const months = Array.from(monthKeys).sort();

  const bySource = Array.from(root.entries())
    .sort(([, a], [, b]) => b.subscribers - a.subscribers)
    .map(([source, agg]) => ({
      source,
      subscribers: agg.subscribers,
      mrr: round2(agg.mrr),
      percentage: pct(agg.subscribers, attributed),
      byMonth: agg.byMonth,
      mediums: Array.from(agg.children.entries())
        .sort(([, a], [, b]) => b.subscribers - a.subscribers)
        .map(([medium, mAgg]) => ({
          medium,
          subscribers: mAgg.subscribers,
          mrr: round2(mAgg.mrr),
          byMonth: mAgg.byMonth,
          campaigns: Array.from(mAgg.children.entries())
            .sort(([, a], [, b]) => b.subscribers - a.subscribers)
            .map(([campaign, cAgg]) => ({
              campaign,
              subscribers: cAgg.subscribers,
              mrr: round2(cAgg.mrr),
              byMonth: cAgg.byMonth,
            })),
        })),
    }));

  logger.info(
    { subscriptions: subRows.length, attributed, contacts: contacts.length },
    "Acquisition: paid subscriptions attributed to UTM origin"
  );

  return {
    totalSubscriptions: subRows.length,
    attributed,
    attributionRate: pct(attributed, subRows.length),
    mrrAttributed: round2(mrrAttributed),
    available: true,
    months,
    monthLabels: months.map(formatMonthKey),
    bySource,
  };
}

/** Cache key the admin refresh endpoint invalidates. */
export function acquisitionCacheKey(): string {
  return `ac:list-contacts:${MEMBERS_LIST_ID}`;
}
