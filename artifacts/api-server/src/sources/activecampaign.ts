import { logger } from "../lib/logger";

function getConfig() {
  const apiKey = process.env.AC_API_KEY || "";
  const baseUrl = (process.env.AC_BASE_URL || "").replace(/\/$/, "");
  return { apiKey, baseUrl };
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
  fields?: ACField[];
  fieldValues?: ACFieldValue[] | string[];
  tags?: string[];
  _resolvedFieldValues?: ACFieldValue[];
}

export interface ACField {
  field: string;
  value: string;
}

export interface ACTag {
  id: string;
  tag: string;
  tagType: string;
}

async function paginateContacts(params: Record<string, string>): Promise<ACContact[]> {
  const results: ACContact[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = (await acFetch("/contacts", {
      ...params,
      limit: limit.toString(),
      offset: offset.toString(),
    })) as {
      contacts?: ACContact[];
      fieldValues?: ACFieldValue[];
      meta?: { total?: string };
    };

    const contacts = data.contacts ?? [];

    const topLevelFieldValues = data.fieldValues ?? [];
    if (topLevelFieldValues.length > 0) {
      const fvByContact: Record<string, ACFieldValue[]> = {};
      for (const fv of topLevelFieldValues) {
        const cid = fv.contact ?? fv.owner;
        if (!fvByContact[cid]) fvByContact[cid] = [];
        fvByContact[cid].push(fv);
      }
      for (const c of contacts) {
        c._resolvedFieldValues = fvByContact[c.id] ?? [];
      }
    }

    results.push(...contacts);

    if (contacts.length < limit) break;
    offset += limit;
  }

  return results;
}

export async function getContacts(
  createdAfter: string,
  createdBefore: string
): Promise<ACContact[]> {
  try {
    return await paginateContacts({
      "filters[created_after]": createdAfter,
      "filters[created_before]": createdBefore,
    });
  } catch (err) {
    logger.error({ err }, "Error fetching AC contacts");
    throw err;
  }
}

export async function getContactTags(contactId: string): Promise<string[]> {
  try {
    const data = (await acFetch(`/contacts/${contactId}/contactTags`)) as {
      contactTags?: Array<{ tag: string }>;
    };
    return (data.contactTags ?? []).map((t) => t.tag);
  } catch (err) {
    logger.error({ err }, "Error fetching AC contact tags");
    throw err;
  }
}

export async function getTagList(): Promise<ACTag[]> {
  try {
    const data = (await acFetch("/tags", { limit: "100" })) as { tags?: ACTag[] };
    return data.tags ?? [];
  } catch (err) {
    logger.error({ err }, "Error fetching AC tags");
    throw err;
  }
}

export async function getContactsByTag(tagName: string): Promise<ACContact[]> {
  try {
    const tags = await getTagList();
    const tag = tags.find((t) => t.tag.toLowerCase() === tagName.toLowerCase());
    if (!tag) return [];

    const data = (await acFetch("/contacts", {
      "filters[tagid]": tag.id,
      limit: "100",
    })) as { contacts?: ACContact[] };
    return data.contacts ?? [];
  } catch (err) {
    logger.error({ err }, "Error fetching AC contacts by tag");
    throw err;
  }
}

export async function getContactsWithFields(
  createdAfter: string,
  createdBefore: string
): Promise<ACContact[]> {
  const contacts = await getContacts(createdAfter, createdBefore);
  return contacts;
}

export async function getLeadContacts(
  tagId: string,
  createdAfter: string,
  createdBefore: string
): Promise<ACContact[]> {
  try {
    return await paginateContacts({
      "filters[tagid]": tagId,
      "filters[created_after]": createdAfter,
      "filters[created_before]": createdBefore,
      include: "fieldValues",
    });
  } catch (err) {
    logger.error({ err }, "Error fetching lead contacts from AC");
    throw err;
  }
}

export function getContactUtmField(contact: ACContact, fieldId: string): string {
  const resolved = contact._resolvedFieldValues;
  if (resolved && resolved.length > 0) {
    const fv = resolved.find((f) => f.field === fieldId);
    if (fv?.value?.trim()) return fv.value.trim();
  }

  const legacyMap: Record<string, string> = { "13": "utm_source", "14": "utm_medium" };
  const legacyKey = legacyMap[fieldId];
  if (legacyKey) {
    const fields = contact.fields as ACField[] | undefined;
    const f = fields?.find((fi) => fi.field.toLowerCase().includes(legacyKey));
    if (f?.value?.trim()) return f.value.trim();
  }
  return "";
}
