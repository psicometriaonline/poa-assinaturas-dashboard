import { Router, type IRouter, type Request, type Response } from "express";
import { withCache } from "../cache";
import { getRevenueMetrics } from "../metrics/revenue";
import { getChurnMetrics } from "../metrics/churn";
import { getConversionMetrics } from "../metrics/conversion";
import { getAcquisitionMetrics } from "../metrics/acquisition";
import { getLeadsMetrics, takeLeadsSnapshot, getLeadsSnapshots } from "../metrics/leads";
import { query } from "../lib/db";
import { CHURN_EVENTS } from "../lib/churn-events";
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

router.use((_req: Request, res: Response, next: () => void) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

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

      const monthStartMs = monthStart.getTime();

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
        // Count gross new subscriptions using accession_date (same logic as Revenue tab)
        query<{ count: string }>(
          `SELECT COUNT(*) as count
           FROM hotmart_subscriptions
           WHERE accession_date IS NOT NULL
             AND accession_date >= $1
             AND original_event IN ('IMPORT_CSV', 'PURCHASE_APPROVED', 'REACTIVATED_PURCHASE')`,
          [monthStartMs]
        ),
        query<{ count: string }>(
          `SELECT COUNT(DISTINCT subscriber_code) as count
           FROM hotmart_webhook_events
           WHERE event = ANY($1::text[])
             AND received_at >= $2`,
          [[...CHURN_EVENTS], monthStart]
        ),
      ]);

      const activeSubscribers = parseInt(activeRow[0]?.count ?? "0", 10);
      const mrr = parseFloat(mrrRow[0]?.sum ?? "0");
      const arr = Math.round(mrr * 12 * 100) / 100;
      const newSubscribers = parseInt(newRow[0]?.count ?? "0", 10);
      const cancellations = parseInt(cancelRow[0]?.count ?? "0", 10);
      const netNewSubscribers = newSubscribers - cancellations;
      // start-of-month base = active_now + cancellations_this_month - new_subs_this_month
      const startOfMonthBase = activeSubscribers + cancellations - newSubscribers;
      const churnDenominator = startOfMonthBase + cancellations;
      const churnRate = churnDenominator > 0 ? parseFloat(((cancellations / churnDenominator) * 100).toFixed(2)) : 0;

      return {
        mrr,
        arr,
        mrrChange: null,
        activeSubscribers,
        newSubscribers,
        cancellations,
        netNewSubscribers,
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
  const TRAFFIC_TTL = 5 * 60 * 1000;
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

      // Build 7×24 matrix: weeklyHourly[dayRow][hour]
      // Rows: 0=Seg(Mon)…5=Sáb(Sat), 6=Dom(Sun)
      const BRT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const DAY_TO_ROW = [6, 0, 1, 2, 3, 4, 5]; // JS Sunday=0 → row 6
      const weeklyHourly: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
      const brtFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        hour: "numeric",
        weekday: "short",
        hour12: false,
      });
      for (const pv of hrData.pageviews) {
        const parts = brtFmt.formatToParts(new Date(pv.x));
        const hourPart = parts.find((p) => p.type === "hour");
        const weekdayPart = parts.find((p) => p.type === "weekday");
        if (!hourPart || !weekdayPart) continue;
        const hour = parseInt(hourPart.value) % 24;
        const jsDay = BRT_DAYS.indexOf(weekdayPart.value);
        if (jsDay === -1) continue;
        weeklyHourly[DAY_TO_ROW[jsDay]][hour] += pv.y;
      }

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
        weeklyHourly,
      };
    }, TRAFFIC_TTL);
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching traffic");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar tráfego"));
  }
});

router.get("/debug/subscriptions", async (_req: Request, res: Response) => {
  try {
    const [statusRows, productRows] = await Promise.all([
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) as count FROM hotmart_subscriptions GROUP BY status ORDER BY count DESC`
      ),
      query<{ status: string; product_id: string; product_name: string; count: string }>(
        `SELECT status, product_id, COALESCE(product_name, 'Sem produto') as product_name, COUNT(*) as count
         FROM hotmart_subscriptions GROUP BY status, product_id, product_name ORDER BY status, count DESC`
      ),
    ]);

    const byStatus: Record<string, { total: number; products: Record<string, { name: string; count: number }> }> = {};
    for (const row of statusRows) {
      byStatus[row.status] = { total: parseInt(row.count, 10), products: {} };
    }
    for (const row of productRows) {
      if (!byStatus[row.status]) byStatus[row.status] = { total: 0, products: {} };
      byStatus[row.status].products[row.product_id ?? "?"] = {
        name: row.product_name,
        count: parseInt(row.count, 10),
      };
    }

    const grandTotal = Object.values(byStatus).reduce((s, r) => s + r.total, 0);
    res.json({ source: "local-db", grandTotal, byStatus });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/leads", async (req: Request, res: Response) => {
  try {
    const startParam = (req.query.start as string) || "2015-01-01";
    const endParam = (req.query.end as string) || new Date().toISOString().split("T")[0];

    const startDate = new Date(`${startParam}T00:00:00.000Z`);
    const endDate = new Date(`${endParam}T23:59:59.999Z`);

    const cacheKey = `leads:${startParam}:${endParam}`;
    const data = await withCache(cacheKey, () => getLeadsMetrics(startDate, endDate));
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching leads");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao carregar métricas de leads"));
  }
});

router.get("/leads/snapshots", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "90"), 365);
    const data = await getLeadsSnapshots(limit);
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching leads snapshots");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar snapshots"));
  }
});

router.post("/leads/snapshot", async (req: Request, res: Response) => {
  const token = req.headers["x-admin-token"];
  if (token !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: true, message: "Unauthorized" });
    return;
  }
  try {
    const snap = await takeLeadsSnapshot();
    res.json({ error: false, data: snap });
  } catch (err) {
    req.log.error({ err }, "Error taking leads snapshot");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao gerar snapshot"));
  }
});

export default router;
