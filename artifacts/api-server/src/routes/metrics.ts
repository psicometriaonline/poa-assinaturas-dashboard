import { Router, type IRouter, type Request, type Response } from "express";
import { withCache } from "../cache";
import { getRevenueMetrics } from "../metrics/revenue";
import { getChurnMetrics } from "../metrics/churn";
import { getConversionMetrics } from "../metrics/conversion";
import { getAcquisitionMetrics } from "../metrics/acquisition";
import { getAllActiveSubscriptions } from "../sources/hotmart";
import { getDbSubscriptionSummary } from "../lib/subscription-db";
import { query } from "../lib/db";
import {
  getWebsiteStats,
  getPageViews,
  getUrlPaths,
  getUtmSources,
  getUtmMedium,
  getUtmCampaign,
  getCountries,
  getHourlyPageviews,
} from "../sources/umami";

const router: IRouter = Router();

function parseDateRange(req: Request): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = req.query.end
    ? new Date(req.query.end as string)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startDate = req.query.start
    ? new Date(req.query.start as string)
    : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return { startDate, endDate };
}

function errorResponse(message: string) {
  return { error: true, message, data: null };
}

router.get("/overview", async (req: Request, res: Response) => {
  try {
    const cacheKey = "overview";
    const data = await withCache(cacheKey, async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // --- Dados reais: apenas DB (planilha importada + webhooks) ---
      const CANCELLATION_EVENTS = [
        "SUBSCRIPTION_CANCELLATION",
        "PURCHASE_CANCELED",
        "PURCHASE_REFUNDED",
        "PURCHASE_CHARGEBACK",
        "PURCHASE_EXPIRED",
      ];

      const [activeRow, mrrRow, newRow, cancelRow] = await Promise.all([
        query<{ count: string }>(
          `SELECT COUNT(*) as count FROM hotmart_subscriptions WHERE status = 'ACTIVE'`
        ),
        query<{ sum: string }>(
          `SELECT COALESCE(SUM(
             CASE WHEN mrr_contribution IS NOT NULL THEN mrr_contribution
                  WHEN plan_interval = 'ANNUAL' THEN ROUND(price_value / 12, 2)
                  ELSE price_value END
           ), 0) as sum
           FROM hotmart_subscriptions WHERE status = 'ACTIVE' AND price_value IS NOT NULL`
        ),
        query<{ count: string }>(
          `SELECT COUNT(DISTINCT subscriber_code) as count
           FROM hotmart_webhook_events
           WHERE event = 'PURCHASE_APPROVED'
             AND received_at >= $1`,
          [monthStart]
        ),
        query<{ count: string }>(
          `SELECT COUNT(DISTINCT subscriber_code) as count
           FROM hotmart_webhook_events
           WHERE event = ANY($1::text[])
             AND received_at >= $2`,
          [CANCELLATION_EVENTS, monthStart]
        ),
      ]);

      const activeSubscribers = parseInt(activeRow[0]?.count ?? "0", 10);
      const mrr = parseFloat(mrrRow[0]?.sum ?? "0");
      const arr = Math.round(mrr * 12 * 100) / 100;
      const newSubscribers = parseInt(newRow[0]?.count ?? "0", 10);
      const cancellations = parseInt(cancelRow[0]?.count ?? "0", 10);
      const churnBase = activeSubscribers + cancellations;
      const churnRate = churnBase > 0 ? parseFloat(((cancellations / churnBase) * 100).toFixed(2)) : 0;

      return {
        mrr,
        arr,
        mrrChange: null,
        activeSubscribers,
        newSubscribers,
        cancellations,
        churnRate,
        conversionRate: 0,
      };
    });
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching overview");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar overview"));
  }
});

router.get("/revenue", async (req: Request, res: Response) => {
  const { startDate, endDate } = parseDateRange(req);
  const cacheKey = `revenue:${startDate.toISOString()}:${endDate.toISOString()}`;
  try {
    const data = await withCache(cacheKey, () => getRevenueMetrics(startDate, endDate));
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching revenue");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar receita"));
  }
});

router.get("/churn", async (req: Request, res: Response) => {
  const { startDate, endDate } = parseDateRange(req);
  const cacheKey = `churn:${startDate.toISOString()}:${endDate.toISOString()}`;
  try {
    const data = await withCache(cacheKey, () => getChurnMetrics(startDate, endDate));
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching churn");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar churn"));
  }
});

router.get("/funnel", async (req: Request, res: Response) => {
  const { startDate, endDate } = parseDateRange(req);
  const cacheKey = `funnel:${startDate.toISOString()}:${endDate.toISOString()}`;
  try {
    const data = await withCache(cacheKey, () => getConversionMetrics(startDate, endDate));
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching funnel");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar funil"));
  }
});

router.get("/acquisition", async (req: Request, res: Response) => {
  const { startDate, endDate } = parseDateRange(req);
  const cacheKey = `acquisition:${startDate.toISOString()}:${endDate.toISOString()}`;
  try {
    const data = await withCache(cacheKey, () => getAcquisitionMetrics(startDate, endDate));
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching acquisition");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar aquisição"));
  }
});

router.get("/traffic", async (req: Request, res: Response) => {
  const { startDate, endDate } = parseDateRange(req);
  const cacheKey = `traffic:${startDate.toISOString()}:${endDate.toISOString()}`;
  try {
    const data = await withCache(cacheKey, async () => {
      const startAt = startDate.getTime();
      const endAt = endDate.getTime();

      const [stats, pageviewsData, hourlyData, topPaths, utmSource, utmMedium, utmCampaign, countries] =
        await Promise.allSettled([
          getWebsiteStats(startAt, endAt),
          getPageViews(startAt, endAt),
          getHourlyPageviews(startAt, endAt),
          getUrlPaths(startAt, endAt),
          getUtmSources(startAt, endAt),
          getUtmMedium(startAt, endAt),
          getUtmCampaign(startAt, endAt),
          getCountries(startAt, endAt),
        ]);

      function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
        return r.status === "fulfilled" ? r.value : fallback;
      }

      function safeArray<T>(r: PromiseSettledResult<T[]>, max?: number): T[] {
        const arr = r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [];
        return max !== undefined ? arr.slice(0, max) : arr;
      }

      const fallbackStats = { pageviews: { value: 0 }, visitors: { value: 0 }, bounces: { value: 0 }, totaltime: { value: 0 } };
      const statsData = settled(stats, fallbackStats);
      const pvData = settled(pageviewsData, { pageviews: [], sessions: [] });
      const hrData = settled(hourlyData, { pageviews: [], sessions: [] });

      const pageviewsVal = statsData.pageviews?.value ?? 0;
      const uniquesVal = statsData.visitors?.value ?? statsData.uniques?.value ?? 0;
      const bouncesVal = statsData.bounces?.value ?? 0;
      const totaltimeVal = statsData.totaltime?.value ?? 0;

      const bounceRate =
        pageviewsVal > 0
          ? parseFloat(((bouncesVal / pageviewsVal) * 100).toFixed(1))
          : 0;
      const avgDurationMin =
        uniquesVal > 0
          ? parseFloat((totaltimeVal / uniquesVal / 60).toFixed(2))
          : 0;

      const hourlyMap: Record<string, number> = {};
      for (const pv of hrData.pageviews) {
        const hour = new Date(pv.x).getHours().toString();
        hourlyMap[hour] = (hourlyMap[hour] ?? 0) + pv.y;
      }
      const hourly = Array.from({ length: 24 }, (_, h) => ({
        x: h.toString(),
        y: hourlyMap[h.toString()] ?? 0,
      }));

      return {
        stats: {
          pageviews: pageviewsVal,
          uniques: uniquesVal,
          bounces: bouncesVal,
          totaltime: totaltimeVal,
          bounceRate,
          avgDurationMin,
        },
        pageviewsHistory: pvData.pageviews,
        sessionsHistory: pvData.sessions,
        topPaths: safeArray(topPaths, 10),
        utmSource: safeArray(utmSource, 10),
        utmMedium: safeArray(utmMedium, 10),
        utmCampaign: safeArray(utmCampaign, 10),
        countries: safeArray(countries),
        hourly,
      };
    });
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching traffic");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar tráfego"));
  }
});

router.get("/debug/subscriptions", async (_req: Request, res: Response) => {
  try {
    const statuses = ["ACTIVE", "DELAYED", "INACTIVE", "STARTED"] as const;
    const results: Record<string, { total: number; products: Record<string, { name: string; count: number }> }> = {};

    for (const status of statuses) {
      try {
        const subs = status === "ACTIVE"
          ? await getAllActiveSubscriptions()
          : await getAllSubscriptionsByStatus(status);
        const products: Record<string, { name: string; count: number }> = {};
        for (const s of subs) {
          const pid = s.product?.id ?? "?";
          const pname = s.product?.name ?? "?";
          if (!products[pid]) products[pid] = { name: pname, count: 0 };
          products[pid].count++;
        }
        results[status] = { total: subs.length, products };
      } catch (err) {
        results[status] = { total: -1, products: { error: { name: String(err), count: 0 } } };
      }
    }

    const grandTotal = Object.values(results).reduce((s, r) => s + Math.max(r.total, 0), 0);
    res.json({ grandTotal, byStatus: results });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
