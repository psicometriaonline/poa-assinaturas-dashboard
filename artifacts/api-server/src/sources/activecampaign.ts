import { logger } from "../lib/logger";
import { withCache } from "../cache";

/**
 * ActiveCampaign is used for one thing only: the UTM fields captured on the
 * contact record, which let us attribute *paying* subscriptions back to a
 * marketing origin. The free-trial tag/list intersection this module used to
 * serve was removed together with the free-trial product.
 */

const DEFAULT_AC_CONTACT_CACHE_TTL_MS = 15 * 60 * 1000;
const _parsedTtl = parseInt(process.env.AC_CONTACT_CACHE_TTL_MS ?? process.env.AC_EMAIL_CACHE_TTL_MS ?? "", 10);
export const AC_CONTACT_CACHE_TTL_MS =
  Number.isFinite(_parsedTtl) && _parsedTtl > 0 ? _parsedTtl : DEFAULT_AC_CONTACT_CACHE_TTL_MS;

/** Custom field ids for the UTM parameters stored on each AC contact. */
export const UTM_FIELD_IDS = {
  content: "12",
  source: "13",
  medium: "14",
  campaign: "15",
} as const;

/** "Alunos - POA" — the list every paying member belongs to. */
export const MEMBERS_LIST_ID = process.env.AC_MEMBERS_LIST_ID || "30";

function getConfig() {
  const apiKey = process.env.AC_API_KEY || "";
  const baseUrl = (process.env.AC_BASE_URL || "").replace(/\/$/, "");
  return { apiKey, baseUrl };
}

export function isActiveCampaignConfigured(): boolean {
  const { apiKey, baseUrl } = getConfig();
  return Boolean(apiKey && baseUrl);
}

async function acFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const { apiKey, baseUrl } = getConfig();
  const url = new URL(`${baseUrl}/api/3${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    headers: {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ActiveCampaign API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export interface ACFieldValue {
  id: string;
  contact: string;
  owner: string;
  field: string;
  value: string;
}

export interface ACContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  cdate: string;
  _resolvedFieldValues?: ACFieldValue[];
}

/**
 * Every contact in a list, with UTM field values resolved onto each contact.
 * Cached — a full pagination of the members list is several API round-trips.
 */
export async function getListContacts(listId: string): Promise<ACContact[]> {
  return withCache(
    `ac:list-contacts:${listId}`,
    async () => {
      const results: ACContact[] = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const data = (await acFetch("/contacts", {
          listid: listId,
          status: "1",
          include: "fieldValues",
          limit: limit.toString(),
          offset: offset.toString(),
        })) as {
          contacts?: ACContact[];
          fieldValues?: ACFieldValue[];
          meta?: { total?: string };
        };

        const contacts = data.contacts ?? [];

        const fvByContact: Record<string, ACFieldValue[]> = {};
        for (const fv of data.fieldValues ?? []) {
          const cid = fv.contact ?? fv.owner;
          if (!fvByContact[cid]) fvByContact[cid] = [];
          fvByContact[cid].push(fv);
        }
        for (const c of contacts) {
          c._resolvedFieldValues = fvByContact[c.id] ?? [];
        }

        results.push(...contacts);

        if (contacts.length === 0) break;
        offset += limit;
        if (data.meta?.total !== undefined && offset >= parseInt(data.meta.total, 10)) break;
      }

      logger.info({ listId, count: results.length }, "AC list contacts fetched and cached");
      return results;
    },
    AC_CONTACT_CACHE_TTL_MS
  );
}

export function getContactUtmField(contact: ACContact, fieldId: string): string {
  const fv = contact._resolvedFieldValues?.find((f) => f.field === fieldId);
  return fv?.value?.trim() ?? "";
}
