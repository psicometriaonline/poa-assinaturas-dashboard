import { Router, type IRouter, type Request, type Response } from "express";
import { withCache } from "../cache";
import { getRevenueMetrics } from "../metrics/revenue";
import { getChurnMetrics } from "../metrics/churn";
import { getConversionMetrics } from "../metrics/conversion";
import { getAcquisitionMetrics } from "../metrics/acquisition";
import { getAllActiveSubscriptions, getAllSubscriptionsByStatus, getSubscriptions } from "../sources/hotmart";
import { getContacts } from "../sources/activecampaign";
import { getDbSubscriptionSummary } from "../lib/subscription-db";
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
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      const startTs = monthStart.getTime();
      const endTs = monthEnd.getTime();
      const prevStartTs = prevMonthStart.getTime();
      const prevEndTs = prevMonthEnd.getTime();

      const [
        activeNow,
        newThisMonth,
        activePrev,
        allCancelled,
        allDelayed,
        allInactive,
        contactsThisMonth,
        dbSummary,
        dbSummaryPrev,
      ] = await Promise.all([
        getAllActiveSubscriptions(),
        getSubscriptions("ACTIVE", startTs, endTs),
        getSubscriptions("ACTIVE", prevStartTs, prevEndTs),
        getAllSubscriptionsByStatus("CANCELLED"),
        getAllSubscriptionsByStatus("DELAYED"),
        getAllSubscriptionsByStatus("INACTIVE"),
        getContacts(monthStart.toISOString(), monthEnd.toISOString()),
        getDbSubscriptionSummary(startTs, endTs).catch(() => null),
        getDbSubscriptionSummary(prevStartTs, prevEndTs).catch(() => null),
      ]);

      const apiMrr = activeNow.reduce((sum, s) => sum + (s.price?.value ?? 0), 0);
      const apiMrrPrev = activePrev.reduce((sum, s) => sum + (s.price?.value ?? 0), 0);

      const apiSubscriberCodes = new Set(activeNow.map(s => s.subscriber_code).filter(Boolean));
      const dbExclusiveActive = dbSummary
        ? Math.max(0, dbSummary.active - [...apiSubscriberCodes].length)
        : 0;

      const mrr = apiMrr + (dbSummary?.mrr ?? 0);
      const mrrPrev = apiMrrPrev + (dbSummaryPrev?.mrr ?? 0);

      function countInRange(arr: typeof allCancelled, start: number, end: number): number {
        return arr.filter(s => {
          const ts = s.cancellation_date ?? s.accession_date;
          return ts && ts >= start && ts <= end;
        }).length;
      }

      const apiCancellationsThisMonth =
        countInRange(allCancelled, startTs, endTs) +
        countInRange(allDelayed, startTs, endTs) +
        countInRange(allInactive, startTs, endTs);

      const cancellationsThisMonth = apiCancellationsThisMonth + (dbSummary?.cancelledThisMonth ?? 0);

      const apiCancellationsPrev =
        countInRange(allCancelled, prevStartTs, prevEndTs) +
        countInRange(allDelayed, prevStartTs, prevEndTs) +
        countInRange(allInactive, prevStartTs, prevEndTs);

      const cancellationsPrev = apiCancellationsPrev + (dbSummaryPrev?.cancelledThisMonth ?? 0);

      const totalActive = activeNow.length + dbExclusiveActive;
      const newSubscribers = newThisMonth.length + (dbSummary?.newThisMonth ?? 0);
      const newSubscribersPrev = activePrev.length + (dbSummaryPrev?.newThisMonth ?? 0);

      const churnBase = totalActive + cancellationsThisMonth;
      const churnRate = churnBase > 0 ? (cancellationsThisMonth / churnBase) * 100 : 0;

      const totalRegistrations = contactsThisMonth.length;

      return {
        mrr,
        mrrPrev,
        mrrChange: mrrPrev > 0 ? ((mrr - mrrPrev) / mrrPrev) * 100 : 0,
        activeSubscribers: totalActive,
        newSubscribers,
        newSubscribersPrev,
        cancellations: cancellationsThisMonth,
        cancellationsPrev,
        churnRate: parseFloat(churnRate.toFixed(2)),
        totalRegistrations,
        conversionRate: totalRegistrations > 0 ? (newSubscribers / totalRegistrations) * 100 : 0,
        avgDaysToConversion: 0,
        dataSource: {
          apiActive: activeNow.length,
          webhookActive: dbExclusiveActive,
          webhookTotal: dbSummary?.total ?? 0,
        },
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
