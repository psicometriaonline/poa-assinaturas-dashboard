import { query } from "../lib/db";
import { logger } from "../lib/logger";
import { fetchMembersSheet, type MemberRow } from "../sources/googlesheets";

export interface LeadMapMetrics {
  totalWithProfile: number;
  totalMembers: number;
  escolaridade: Array<{ label: string; value: number }>;
  area: Array<{ label: string; value: number }>;
  curso: Array<{ label: string; value: number }>;
  pesquisador: { sim: number; nao: number };
  professor: { sim: number; nao: number };
  coordPesquisa: { sim: number; nao: number };
  coordPPG: { sim: number; nao: number };
  sexo: Array<{ label: string; value: number }>;
  topInstituicoes: Array<{ label: string; value: number }>;
}

function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

function countBy(items: string[], normalize?: (s: string) => string): Array<{ label: string; value: number }> {
  const map: Record<string, number> = {};
  for (const raw of items) {
    if (!raw) continue;
    const item = normalize ? normalize(raw) : raw;
    if (!item) continue;
    map[item] = (map[item] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function countYesNo(items: string[]): { sim: number; nao: number } {
  let sim = 0;
  let nao = 0;
  for (const v of items) {
    if (v === "Sim") sim++;
    else if (v === "Não") nao++;
  }
  return { sim, nao };
}

let cachedMembers: { data: MemberRow[]; fetchedAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

async function getMembers(): Promise<MemberRow[]> {
  if (cachedMembers && Date.now() - cachedMembers.fetchedAt < CACHE_TTL) {
    return cachedMembers.data;
  }
  const data = await fetchMembersSheet();
  cachedMembers = { data, fetchedAt: Date.now() };
  return data;
}

export async function getLeadMapMetrics(): Promise<LeadMapMetrics> {
  const members = await getMembers();

  const totalWithProfile = members.length;

  const escolaridade = countBy(members.map((m) => m.escolaridade));
  const area = countBy(members.map((m) => m.area_atuacao));
  const curso = countBy(members.map((m) => m.curso).filter(Boolean), titleCase);
  const pesquisador = countYesNo(members.map((m) => m.pesquisador));
  const professor = countYesNo(members.map((m) => m.professor_universitario));
  const coordPesquisa = countYesNo(members.map((m) => m.coord_pesquisa));
  const coordPPG = countYesNo(members.map((m) => m.coord_ppg));
  const sexo = countBy(members.map((m) => m.sexo).filter(Boolean));
  const topInstituicoes = countBy(members.map((m) => m.instituicao).filter(Boolean)).slice(0, 20);

  let totalMembers = 0;
  try {
    const res = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM hotmart_subscriptions`
    );
    totalMembers = parseInt(res[0]?.count ?? "0", 10);
  } catch {
    totalMembers = 0;
  }

  return {
    totalWithProfile,
    totalMembers,
    escolaridade,
    area,
    curso,
    pesquisador,
    professor,
    coordPesquisa,
    coordPPG,
    sexo,
    topInstituicoes,
  };
}
