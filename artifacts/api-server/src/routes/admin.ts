import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { query } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function requireAdminToken(req: Request, res: Response, next: () => void) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: true, message: "ADMIN_SECRET não configurado no servidor." });
    return;
  }
  const token = req.headers["x-admin-token"];
  if (token !== adminSecret) {
    res.status(401).json({ error: true, message: "Token inválido." });
    return;
  }
  next();
}

function detectInterval(planName: string): "ANNUAL" | "MONTHLY" | "SEMIANNUAL" {
  const name = planName ?? "";
  if (/mensal|monthly|pro mensal/i.test(name) || /^REC_/i.test(name)) return "MONTHLY";
  if (/semestral/i.test(name)) return "SEMIANNUAL";
  return "ANNUAL";
}

function parseExcelDate(raw: unknown): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
  return null;
}

router.post(
  "/import-subscribers",
  requireAdminToken,
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: true, message: "Nenhum arquivo enviado." });
      return;
    }

    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

      const headers = rows[0] as string[];
      const idxOf = (name: string) =>
        headers.findIndex((h) => String(h).toLowerCase().includes(name.toLowerCase()));

      const iStatus  = idxOf("Status");
      const iName    = idxOf("Cliente");
      const iCode    = idxOf("Código");
      const iProduct = idxOf("Produto");
      const iPlan    = idxOf("Plano");
      const iValue   = idxOf("Valor");
      const iAccess  = idxOf("Adesão");
      const iCancel  = idxOf("Cancelamento");
      const iEmail   = idxOf("Email");

      if (iCode === -1) {
        res.status(422).json({ error: true, message: "Coluna 'Código' não encontrada. Verifique o formato do arquivo." });
        return;
      }

      const dataRows = rows.slice(1).filter((r) => r && r[iCode]);

      // Remove only import-sourced records (not touched by webhooks)
      const delRes = await query(
        `DELETE FROM hotmart_subscriptions WHERE last_event = 'IMPORT_CSV'`
      );
      logger.info({ deleted: (delRes as any).rowCount }, "Registros de import anteriores removidos");

      let inserted = 0;
      let skipped = 0;
      const byProduct: Record<string, number> = {};

      for (const row of dataRows) {
        const statusRaw = String(row[iStatus] ?? "").trim();
        const status =
          statusRaw === "Ativo" ? "ACTIVE"
          : statusRaw === "Cancelado" ? "CANCELLED"
          : statusRaw === "Atrasado" ? "DELAYED"
          : statusRaw === "Inativo" ? "INACTIVE"
          : "ACTIVE";

        const subscriberCode  = String(row[iCode] ?? "").trim();
        const subscriberName  = String(row[iName] ?? "").trim();
        const productName     = String(row[iProduct] ?? "").trim();
        const planName        = String(row[iPlan] ?? "").trim();
        const subscriberEmail = String(row[iEmail] ?? "").trim();
        const rawValue        = row[iValue];
        const priceValue      = rawValue != null ? parseFloat(String(rawValue).replace(",", ".")) : null;
        const accessionDate   = parseExcelDate(row[iAccess]);
        const cancellationDate = parseExcelDate(row[iCancel]);
        const planInterval    = detectInterval(planName);
        const mrrContribution = priceValue != null
          ? planInterval === "ANNUAL" ? Math.round((priceValue / 12) * 100) / 100
          : planInterval === "SEMIANNUAL" ? Math.round((priceValue / 6) * 100) / 100
          : priceValue
          : null;

        if (!subscriberCode) { skipped++; continue; }

        try {
          await query(
            `INSERT INTO hotmart_subscriptions (
              subscriber_code, status, product_name, plan_name,
              subscriber_name, subscriber_email,
              accession_date, cancellation_date,
              price_value, price_currency,
              plan_interval, mrr_contribution,
              last_event, last_event_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'BRL',$10,$11,'IMPORT_CSV',NOW(),NOW())
            ON CONFLICT (subscriber_code) DO UPDATE SET
              status = EXCLUDED.status,
              product_name = COALESCE(EXCLUDED.product_name, hotmart_subscriptions.product_name),
              plan_name = COALESCE(EXCLUDED.plan_name, hotmart_subscriptions.plan_name),
              subscriber_name = COALESCE(EXCLUDED.subscriber_name, hotmart_subscriptions.subscriber_name),
              subscriber_email = COALESCE(EXCLUDED.subscriber_email, hotmart_subscriptions.subscriber_email),
              accession_date = COALESCE(EXCLUDED.accession_date, hotmart_subscriptions.accession_date),
              cancellation_date = EXCLUDED.cancellation_date,
              price_value = COALESCE(EXCLUDED.price_value, hotmart_subscriptions.price_value),
              plan_interval = EXCLUDED.plan_interval,
              mrr_contribution = EXCLUDED.mrr_contribution,
              last_event = EXCLUDED.last_event,
              last_event_at = NOW(),
              updated_at = NOW()
            WHERE hotmart_subscriptions.last_event = 'IMPORT_CSV'`,
            [
              subscriberCode, status, productName, planName,
              subscriberName, subscriberEmail,
              accessionDate, cancellationDate,
              priceValue, planInterval, mrrContribution,
            ]
          );
          inserted++;
          byProduct[productName] = (byProduct[productName] ?? 0) + 1;
        } catch (err) {
          logger.error({ err, subscriberCode }, "Erro ao inserir assinante");
          skipped++;
        }
      }

      const mrrRows = await query<{ sum: string }>(
        `SELECT COALESCE(SUM(
          CASE WHEN mrr_contribution IS NOT NULL THEN mrr_contribution
               WHEN plan_interval = 'ANNUAL' THEN ROUND(price_value / 12, 2)
               ELSE price_value END
        ), 0) as sum
        FROM hotmart_subscriptions WHERE status = 'ACTIVE' AND price_value IS NOT NULL`
      );
      const activeRows = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM hotmart_subscriptions WHERE status = 'ACTIVE'`
      );

      const mrr = parseFloat(mrrRows[0]?.sum ?? "0");
      const activeCount = parseInt(activeRows[0]?.count ?? "0", 10);

      logger.info({ inserted, skipped, mrr, activeCount }, "Import de assinantes concluído");

      res.json({
        error: false,
        data: {
          inserted,
          skipped,
          byProduct,
          mrr,
          arr: Math.round(mrr * 12 * 100) / 100,
          activeSubscribers: activeCount,
        },
      });
    } catch (err) {
      logger.error({ err }, "Erro no import de assinantes");
      res.status(500).json({ error: true, message: err instanceof Error ? err.message : "Erro ao processar arquivo." });
    }
  }
);

export default router;
