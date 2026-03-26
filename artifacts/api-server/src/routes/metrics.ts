import { Router, type IRouter, type Request, type Response } from "express";
import { withCache } from "../cache";
import { getRevenueMetrics } from "../metrics/revenue";
import { getChurnMetrics } from "../metrics/churn";
import { getConversionMetrics } from "../metrics/conversion";
import { getAcquisitionMetrics } from "../metrics/acquisition";
import { getAllActiveSubscriptions, getSubscriptions } from "../sources/hotmart";
import { getContacts } from "../sources/activecampaign";
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

      const [
        activeNow,
        newThisMonth,
        cancelledThisMonth,
        overdueThisMonth,
        inactiveThisMonth,
        activePrev,
        cancelledPrev,
        overduePrev,
        inactivePrev,
        contactsThisMonth,
      ] = await Promise.all([
        getAllActiveSubscriptions(),
        getSubscriptions("ACTIVE", monthStart.getTime(), monthEnd.getTime()),
        getSubscriptions("CANCELLED", monthStart.getTime(), monthEnd.getTime()),
        getSubscriptions("OVERDUE", monthStart.getTime(), monthEnd.getTime()),
        getSubscriptions("INACTIVE", monthStart.getTime(), monthEnd.getTime()),
        getSubscriptions("ACTIVE", prevMonthStart.getTime(), prevMonthEnd.getTime()),
        getSubscriptions("CANCELLED", prevMonthStart.getTime(), prevMonthEnd.getTime()),
        getSubscriptions("OVERDUE", prevMonthStart.getTime(), prevMonthEnd.getTime()),
        getSubscriptions("INACTIVE", prevMonthStart.getTime(), prevMonthEnd.getTime()),
        getContacts(monthStart.toISOString(), monthEnd.toISOString()),
      ]);

      const mrr = activeNow.reduce((sum, s) => sum + (s.price?.value ?? 0), 0);
      const mrrPrev = activePrev.reduce((sum, s) => sum + (s.price?.value ?? 0), 0);

      const cancellationsThisMonth = cancelledThisMonth.length + overdueThisMonth.length + inactiveThisMonth.length;
      const cancellationsPrev = cancelledPrev.length + overduePrev.length + inactivePrev.length;
      const churnBase = activeNow.length + cancellationsThisMonth;
      const churnRate = churnBase > 0 ? (cancellationsThisMonth / churnBase) * 100 : 0;

      const totalRegistrations = contactsThisMonth.length;

      return {
        mrr,
        mrrPrev,
        mrrChange: mrrPrev > 0 ? ((mrr - mrrPrev) / mrrPrev) * 100 : 0,
        newSubscribers: newThisMonth.length,
        newSubscribersPrev: activePrev.length,
        cancellations: cancellationsThisMonth,
        cancellationsPrev,
        churnRate: parseFloat(churnRate.toFixed(2)),
        totalRegistrations,
        conversionRate: totalRegistrations > 0 ? (newThisMonth.length / totalRegistrations) * 100 : 0,
        avgDaysToConversion: 0,
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

export default router;
