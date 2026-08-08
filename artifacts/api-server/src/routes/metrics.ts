import { Router, type IRouter, type Request, type Response } from "express";
import { withCache } from "../cache";
import { getOverviewMetrics } from "../metrics/overview";
import { getRevenueMetrics } from "../metrics/revenue";
import { getChurnMetrics } from "../metrics/churn";
import { getRetentionMetrics } from "../metrics/retention";
import { getSubscriptionsMetrics } from "../metrics/subscriptions";
import { getAcquisitionMetrics } from "../metrics/acquisition";
import { getLeadMapMetrics } from "../metrics/leadmap";
import { getDataCoverage } from "../metrics/coverage";
import { clampStart } from "../lib/metrics-window";
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
  readStat,
  pickUnit,
  isUmamiConfigured,
} from "../sources/umami";

const router: IRouter = Router();

router.use((_req: Request, res: Response, next: () => void) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function parseDateRange(req: Request): { startDate: Date; endDate: Date } {
  const now = new Date();
  // Use BRT (UTC-3) boundaries so that date strings from the browser
  // cover the full calendar day in Brazil, not a midnight-UTC cutoff
  const startDate = req.query.start
    ? new Date(`${req.query.start as string}T00:00:00-03:00`)
    : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const endDate = req.query.end
    ? new Date(`${req.query.end as string}T23:59:59-03:00`)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  // Clamped server-side so no caller can ask for a window that predates the
  // company and drag every chart back through years of junk accession dates.
  return { startDate: clampStart(startDate), endDate };
}

function errorResponse(message: string) {
  return { error: true, message, data: null };
}

/**
 * Wraps a metric in the standard cache + error envelope. Every subscription
 * metric is keyed by the selected period, so the global period selector now
 * actually changes the numbers instead of being silently ignored.
 */
function metricRoute<T>(
  name: string,
  errorMessage: string,
  loader: (startDate: Date, endDate: Date) => Promise<T>,
  ttlMs?: number
) {
  return async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = parseDateRange(req);
    const cacheKey = `${name}:${startDate.toISOString()}:${endDate.toISOString()}`;
    try {
      const data = await withCache(cacheKey, () => loader(startDate, endDate), ttlMs);
      res.json({ error: false, data });
    } catch (err) {
      req.log.error({ err }, `Error fetching ${name}`);
      res
        .status(500)
        .json(errorResponse(err instanceof Error ? err.message : errorMessage));
    }
  };
}

router.get("/overview", metricRoute("overview", "Erro ao buscar visão geral", getOverviewMetrics));
router.get("/revenue", metricRoute("revenue", "Erro ao buscar receita", getRevenueMetrics));
router.get("/churn", metricRoute("churn", "Erro ao buscar churn", getChurnMetrics));
router.get("/retention", metricRoute("retention", "Erro ao buscar retenção", getRetentionMetrics));
router.get(
  "/subscriptions",
  metricRoute("subscriptions", "Erro ao buscar assinaturas", getSubscriptionsMetrics)
);
router.get(
  "/acquisition",
  metricRoute("acquisition", "Erro ao buscar aquisição", getAcquisitionMetrics)
);

router.get("/data-coverage", async (req: Request, res: Response) => {
  try {
    const data = await withCache("data-coverage", () => getDataCoverage(), 10 * 60 * 1000);
    res.json({ error: false, data });
  } catch (err) {
    req.log.error({ err }, "Error fetching data coverage");
    res
      .status(500)
      .json(errorResponse(err instanceof Error ? err.message : "Erro ao apurar cobertura de dados"));
  }
});

router.get("/leadmap", async (_req: Request, res: Response) => {
  try {
    const data = await withCache("leadmap", () => getLeadMapMetrics(), 30 * 60 * 1000);
    res.json({ error: false, data });
  } catch (err) {
    _req.log.error({ err }, "Error fetching member profile");
    res.status(500).json(errorResponse(err instanceof Error ? err.message : "Erro ao buscar perfil dos assinantes"));
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

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const hourlyStartAt = Math.max(startAt, endAt - THIRTY_DAYS_MS);

      const [stats, pageviewsData, hourlyData, topPaths, utmSource, utmMedium, utmCampaign, countries] =
        await Promise.allSettled([
          getWebsiteStats(startAt, endAt),
          getPageViews(startAt, endAt),
          getHourlyPageviews(hourlyStartAt, endAt),
          getUrlPaths(startAt, endAt),
          getUtmSources(startAt, endAt),
          getUtmMedium(startAt, endAt),
          getUtmCampaign(startAt, endAt),
          getCountries(startAt, endAt),
        ]);

      // Failures used to collapse silently into zeros, so a blank traffic page
      // was indistinguishable from a site with no visits. Collect them instead
      // and hand them to the UI.
      const errors: Array<{ source: string; message: string }> = [];
      const NAMES = [
        "estatísticas",
        "série de pageviews",
        "heatmap horário",
        "páginas mais vistas",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "países",
      ];
      [stats, pageviewsData, hourlyData, topPaths, utmSource, utmMedium, utmCampaign, countries]
        .forEach((r, i) => {
          if (r.status === "rejected") {
            errors.push({
              source: NAMES[i],
              message: r.reason instanceof Error ? r.reason.message : String(r.reason),
            });
          }
        });

      function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
        return r.status === "fulfilled" ? r.value : fallback;
      }

      function safeArray<T>(r: PromiseSettledResult<T[]>, max?: number): T[] {
        const arr = r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [];
        return max !== undefined ? arr.slice(0, max) : arr;
      }

      const fallbackStats = { pageviews: 0, visitors: 0, bounces: 0, totaltime: 0 };
      const statsData = settled(stats, fallbackStats);
      const pvData = settled(pageviewsData, { pageviews: [], sessions: [] });
      const hrData = settled(hourlyData, { pageviews: [], sessions: [] });

      const pageviewsVal = readStat(statsData.pageviews);
      const uniquesVal = readStat(statsData.visitors) || readStat(statsData.uniques) || readStat(statsData.visits);
      const bouncesVal = readStat(statsData.bounces);
      const totaltimeVal = readStat(statsData.totaltime);

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
        configured: isUmamiConfigured(),
        unit: pickUnit(startAt, endAt),
        errors,
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

export default router;
