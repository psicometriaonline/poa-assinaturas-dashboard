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

export interface ACContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  cdate: string;
  fields?: ACField[];
  tags?: string[];
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
    })) as { contacts?: ACContact[]; meta?: { total?: string } };

    const contacts = data.contacts ?? [];
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
