import { getContacts } from "../sources/activecampaign";
import { getReferrers, getUtmSources } from "../sources/umami";

export interface AcquisitionMetrics {
  byUtmSource: Array<{ source: string; registrations: number }>;
  byTrafficChannel: Array<{ channel: string; sessions: number }>;
}

export async function getAcquisitionMetrics(
  startDate: Date,
  endDate: Date
): Promise<AcquisitionMetrics> {
  const [contacts, referrers, utmSources] = await Promise.all([
    getContacts(startDate.toISOString(), endDate.toISOString()),
    getReferrers(startDate.getTime(), endDate.getTime()),
    getUtmSources(startDate.getTime(), endDate.getTime()),
  ]);

  const utmMap: Record<string, number> = {};
  for (const c of contacts) {
    const utmSource =
      c.fields?.find((f) => f.field.toLowerCase().includes("utm_source"))?.value ?? "direto";
    const source = utmSource || "direto";
    utmMap[source] = (utmMap[source] ?? 0) + 1;
  }

  const byUtmSource = Object.entries(utmMap)
    .map(([source, registrations]) => ({ source, registrations }))
    .sort((a, b) => b.registrations - a.registrations);

  const byTrafficChannel = referrers
    .map((r) => ({ channel: r.x || "direto", sessions: r.y }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  return { byUtmSource, byTrafficChannel };
}
