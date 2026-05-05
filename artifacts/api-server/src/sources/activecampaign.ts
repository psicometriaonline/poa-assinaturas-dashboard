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
  /** Date when a specific tag was assigned to this contact (set by getLeadContacts) */
  _tagDate?: string;
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

/**
 * Fetch all contacts with a given tag ID (tagid param).
 * Includes UTM fieldValues and contactTags so we can determine the exact
 * date the tag was assigned (_tagDate) rather than contact creation date.
 */
export async function getLeadContacts(tagId: string): Promise<ACContact[]> {
  try {
    const results: ACContact[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = (await acFetch("/contacts", {
        tagid: tagId,
        include: "contactTags,fieldValues",
        limit: limit.toString(),
        offset: offset.toString(),
      })) as {
        contacts?: ACContact[];
        contactTags?: Array<{ contact: string; tag: string; cdate: string }>;
        fieldValues?: ACFieldValue[];
        meta?: { total?: string };
      };

      const contacts = data.contacts ?? [];

      // Map fieldValues by contact id
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

      // Map contactTag assignment date by contact id (only for the requested tagId)
      const contactTagsByContact: Record<string, string> = {};
      for (const ct of data.contactTags ?? []) {
        if (ct.tag === tagId) {
          contactTagsByContact[ct.contact] = ct.cdate;
        }
      }
      for (const c of contacts) {
        if (contactTagsByContact[c.id]) {
          c._tagDate = contactTagsByContact[c.id];
        }
      }

      results.push(...contacts);

      if (contacts.length < limit) break;
      offset += limit;
    }

    return results;
  } catch (err) {
    logger.error({ err }, "Error fetching lead contacts from AC");
    throw err;
  }
}

/**
 * Fetch all active contact emails from a list (e.g. "Alunos - POA", list 30).
 * Returns a Set of lowercase-trimmed emails for fast lookup.
 */
export async function getListContactEmails(listId: string): Promise<Set<string>> {
  try {
    const emails = new Set<string>();
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = (await acFetch("/contacts", {
        listid: listId,
        status: "1",
        limit: limit.toString(),
        offset: offset.toString(),
      })) as {
        contacts?: ACContact[];
        meta?: { total?: string };
      };

      const contacts = data.contacts ?? [];
      for (const c of contacts) {
        if (c.email) emails.add(c.email.toLowerCase().trim());
      }

      if (contacts.length < limit) break;
      offset += limit;
    }

    return emails;
  } catch (err) {
    logger.error({ err }, "Error fetching AC list contact emails");
    throw err;
  }
}

/**
 * Fetch all contact emails with a given tag ID.
 * Returns a Set of lowercase-trimmed emails for fast intersection with list emails.
 */
export async function getTagContactEmails(tagId: string): Promise<Set<string>> {
  try {
    const emails = new Set<string>();
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = (await acFetch("/contacts", {
        tagid: tagId,
        limit: limit.toString(),
        offset: offset.toString(),
      })) as {
        contacts?: ACContact[];
        meta?: { total?: string };
      };

      const contacts = data.contacts ?? [];
      for (const c of contacts) {
        if (c.email) emails.add(c.email.toLowerCase().trim());
      }

      if (contacts.length < limit) break;
      offset += limit;
    }

    return emails;
  } catch (err) {
    logger.error({ err }, "Error fetching AC tag contact emails");
    throw err;
  }
}

/**
 * Get total count of contacts with a tag (no pagination, just meta.total).
 */
export async function getTagContactCount(tagId: string): Promise<number> {
  try {
    const data = (await acFetch("/contacts", {
      tagid: tagId,
      limit: "1",
    })) as { meta?: { total?: string } };
    return parseInt(data.meta?.total ?? "0", 10);
  } catch (err) {
    logger.error({ err }, "Error fetching tag contact count");
    return 0;
  }
}

/**
 * Get total count of active contacts in a list.
 */
export async function getListContactCount(listId: string): Promise<number> {
  try {
    const data = (await acFetch("/contacts", {
      listid: listId,
      status: "1",
      limit: "1",
    })) as { meta?: { total?: string } };
    return parseInt(data.meta?.total ?? "0", 10);
  } catch (err) {
    logger.error({ err }, "Error fetching list contact count");
    return 0;
  }
}

export function getContactUtmField(contact: ACContact, fieldId: string): string {
  const resolved = contact._resolvedFieldValues;
  if (resolved && resolved.length > 0) {
    const fv = resolved.find((f) => f.field === fieldId);
    if (fv?.value?.trim()) return fv.value.trim();
  }

  const legacyMap: Record<string, string> = { "12": "utm_content", "13": "utm_source", "14": "utm_medium", "15": "utm_campaign" };
  const legacyKey = legacyMap[fieldId];
  if (legacyKey) {
    const fields = contact.fields as ACField[] | undefined;
    const f = fields?.find((fi) => fi.field.toLowerCase().includes(legacyKey));
    if (f?.value?.trim()) return f.value.trim();
  }
  return "";
}
