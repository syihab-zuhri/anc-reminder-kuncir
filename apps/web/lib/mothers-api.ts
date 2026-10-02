import { motherListResponseSchema, type MotherSummary } from "@anc/contracts";

/** The API's per-page maximum (see motherListQuerySchema). */
export const MOTHER_PAGE_LIMIT = 100;

/**
 * Safety cap on how many mothers one dropdown loads (20 sequential pages). A Puskesmas is far
 * below this; the cap only stops a runaway loop and is reported to the caller via `truncated`.
 */
export const MOTHER_LIST_MAX = 2_000;

export interface AllMothers {
  readonly items: readonly MotherSummary[];
  /** True when more mothers exist than were loaded because MOTHER_LIST_MAX was reached. */
  readonly truncated: boolean;
}

export class MothersFetchError extends Error {
  public constructor(public readonly status: number) {
    super(`Mother list request failed with status ${status.toString()}`);
    this.name = "MothersFetchError";
  }
}

/**
 * Follows the keyset cursor until the API reports no more pages. The staff pickers (access codes,
 * visit confirmation, patient portal) need every mother in scope; reading only the first page
 * silently hid everyone past the API's default page size of 20.
 */
export async function fetchAllMothers(
  options: { readonly signal?: AbortSignal; readonly fetchImpl?: typeof fetch } = {},
): Promise<AllMothers> {
  const request = options.fetchImpl ?? fetch;
  const items: MotherSummary[] = [];
  let cursor: string | null = null;

  for (;;) {
    const params = new URLSearchParams({ limit: String(MOTHER_PAGE_LIMIT) });
    if (cursor !== null) params.set("cursor", cursor);

    const response = await request(`/api/staff-proxy/mothers?${params.toString()}`, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!response.ok) throw new MothersFetchError(response.status);

    const page = motherListResponseSchema.parse(await response.json());
    items.push(...page.items);

    if (!page.has_more || page.next_cursor === null) return { items, truncated: false };
    if (items.length >= MOTHER_LIST_MAX) return { items, truncated: true };
    cursor = page.next_cursor;
  }
}
