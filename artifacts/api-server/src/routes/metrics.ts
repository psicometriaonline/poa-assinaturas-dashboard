import { Router, type IRouter, type Request, type Response } from "express";
import { withCache } from "../cache";
import { getRevenueMetrics } from "../metrics/revenue";
import { getChurnMetrics } from "../metrics/churn";
import { getConversionMetrics } from "../metrics/conversion";
import { getAcquisitionMetrics } from "../metrics/acquisition";
import { getAllActiveSubscriptions, getSubscriptions } from "../sources/hotmart";
import { getContacts } from "../sources/activecampaign";

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

export default router;
