import { getContacts, getTagList } from "../sources/activecampaign";

export interface ConversionMetrics {
  totalRegistrations: number;
  totalConversions: number;
  conversionRate: number;
  avgDaysToConversion: number;
  distributionByRange: {
    "0-7": number;
    "8-14": number;
    "15-30": number;
    "+30": number;
  };
  byChannel: Array<{ channel: string; registrations: number; conversions: number; rate: number }>;
  history: Array<{
    month: string;
    registrations: number;
    conversions: number;
    conversionRate: number;
  }>;
}

const SUBSCRIBER_TAG_KEYWORDS = ["assinante", "subscriber", "pago", "paid", "cliente"];

function isSubscriberTag(tagName: string): boolean {
  const lower = tagName.toLowerCase();
  return SUBSCRIBER_TAG_KEYWORDS.some((kw) => lower.includes(kw));
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export async function getConversionMetrics(
  startDate: Date,
  endDate: Date
): Promise<ConversionMetrics> {
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  const [contacts, allTags] = await Promise.all([
    getContacts(startStr, endStr),
    getTagList(),
  ]);

  const subscriberTagIds = new Set(
    allTags.filter((t) => isSubscriberTag(t.tag)).map((t) => t.id)
  );

  const totalRegistrations = contacts.length;
  const converted = contacts.filter(
    (c) => c.tags && c.tags.some((tagId) => subscriberTagIds.has(tagId))
  );
  const totalConversions = converted.length;
  const conversionRate =
    totalRegistrations > 0 ? (totalConversions / totalRegistrations) * 100 : 0;

  const daysToConversion: number[] = [];
  const distribution = { "0-7": 0, "8-14": 0, "15-30": 0, "+30": 0 };

  for (const c of converted) {
    const created = new Date(c.cdate).getTime();
    const now = Date.now();
    const days = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    daysToConversion.push(days);
    if (days <= 7) distribution["0-7"]++;
    else if (days <= 14) distribution["8-14"]++;
    else if (days <= 30) distribution["15-30"]++;
    else distribution["+30"]++;
  }

  const avgDaysToConversion =
    daysToConversion.length > 0
      ? daysToConversion.reduce((a, b) => a + b, 0) / daysToConversion.length
      : 0;

  const channelMap: Record<
    string,
    { registrations: number; conversions: number }
  > = {};

  for (const c of contacts) {
    const utmSource =
      c.fields?.find((f) => f.field.toLowerCase().includes("utm_source"))?.value ?? "direto";
    const channel = utmSource || "direto";
    if (!channelMap[channel]) channelMap[channel] = { registrations: 0, conversions: 0 };
    channelMap[channel].registrations++;
    const isConverted = c.tags && c.tags.some((tagId) => subscriberTagIds.has(tagId));
    if (isConverted) channelMap[channel].conversions++;
  }

  const byChannel = Object.entries(channelMap).map(([channel, data]) => ({
    channel,
    registrations: data.registrations,
    conversions: data.conversions,
    rate: data.registrations > 0 ? (data.conversions / data.registrations) * 100 : 0,
  }));

  const history: ConversionMetrics["history"] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const monthStart = startOfMonth(current);
    const monthEnd = endOfMonth(current);

    const monthContacts = contacts.filter((c) => {
      const d = new Date(c.cdate).getTime();
      return d >= monthStart.getTime() && d <= monthEnd.getTime();
    });

    const monthConverted = monthContacts.filter(
      (c) => c.tags && c.tags.some((tagId) => subscriberTagIds.has(tagId))
    );

    const monthRate =
      monthContacts.length > 0
        ? (monthConverted.length / monthContacts.length) * 100
        : 0;

    history.push({
      month: monthLabel(current),
      registrations: monthContacts.length,
      conversions: monthConverted.length,
      conversionRate: parseFloat(monthRate.toFixed(2)),
    });

    current.setMonth(current.getMonth() + 1);
  }

  return {
    totalRegistrations,
    totalConversions,
    conversionRate: parseFloat(conversionRate.toFixed(2)),
    avgDaysToConversion: parseFloat(avgDaysToConversion.toFixed(1)),
    distributionByRange: distribution,
    byChannel,
    history,
  };
}
