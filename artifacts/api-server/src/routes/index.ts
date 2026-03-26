import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metricsRouter from "./metrics";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/metrics", metricsRouter);
router.use("/webhooks", webhooksRouter);

export default router;
