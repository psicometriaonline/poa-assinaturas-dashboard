import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../lib/logger";

let connectors: ReplitConnectors | null = null;

function getConnectors(): ReplitConnectors {
  if (!connectors) connectors = new ReplitConnectors();
  return connectors;
}

const SPREADSHEET_ID = "1Wop1KzMAXyp7fCtM7Ns_2ua92vcxXIOaUnFslotTG0Y";
const SHEET_NAME = "Membros";

export interface MemberRow {
  email: string;
  nome: string;
  sexo: string;
  escolaridade: string;
  area_atuacao: string;
  curso: string;
  instituicao: string;
  pesquisador: string;
  professor_universitario: string;
  coord_pesquisa: string;
  coord_ppg: string;
  perfil_completo: boolean;
  data_criacao: string | null;
}

export async function fetchMembersSheet(): Promise<MemberRow[]> {
  const c = getConnectors();
  const range = encodeURIComponent(`${SHEET_NAME}!A1:R`);
  const res = await c.proxy(
    "google-sheet",
    `/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`,
    { method: "GET" }
  );
  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values ?? [];
  if (rows.length < 2) return [];

  const members: MemberRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const email = (r[2] ?? "").trim().toLowerCase();
    const escolaridade = (r[7] ?? "").trim();
    if (!email || !escolaridade) continue;

    members.push({
      email,
      nome: (r[1] ?? "").trim(),
      sexo: (r[6] ?? "").trim(),
      escolaridade,
      area_atuacao: (r[8] ?? "").trim(),
      curso: (r[9] ?? "").trim(),
      instituicao: (r[10] ?? "").trim(),
      pesquisador: (r[11] ?? "").trim(),
      professor_universitario: (r[12] ?? "").trim(),
      coord_pesquisa: (r[13] ?? "").trim(),
      coord_ppg: (r[14] ?? "").trim(),
      perfil_completo: (r[15] ?? "").trim() === "Sim",
      data_criacao: (r[16] ?? "").trim() || null,
    });
  }

  logger.info({ total: rows.length - 1, withProfile: members.length }, "Google Sheets: fetched members");
  return members;
}
