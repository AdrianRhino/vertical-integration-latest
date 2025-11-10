// src/catalog/buildAbcCatalog.js
import { savePage, getPages, writeManifest, readManifest } from './catalogCache';
import { hubspot } from '@hubspot/ui-extensions';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Builds/Resumes ABC catalog:
 * - Starts from the next uncached page
 * - Updates manifest each page with totals & timestamps
 * - Stops at last page
 */
export async function buildAbcCatalog({
  abcAccessToken,
  itemsPerPage = 300,      // you’re using 300; tune if needed
  backoffMs = 150,
  onProgress,
}) {
  const supplier = 'abc';
  const queryKey = 'abc:all';

  // discover starting point
  const cachedPages = await getPages(supplier, queryKey);
  let current = cachedPages.length ? Math.max(...cachedPages) + 1 : 1;

  // If we already have totals in manifest, keep them; otherwise we’ll learn them on first fetch
  let manifest = await readManifest(supplier, queryKey);
  let totalPages = manifest.totalPages ?? undefined;
  let totalItems = manifest.totalItems ?? undefined;

  // a helper to fetch ONE page from serverless
  async function fetchPage(pageNumber) {
    const res = await hubspot.serverless('fetchAbcPage', {
      parameters: { abcAccessToken, pageNumber, itemsPerPage },
    });
    if (!res?.body?.ok) {
      throw new Error(res?.body?.error || `fetchAbcPage failed (page ${pageNumber})`);
    }
    return res.body.data; // { items, pagination }
  }

  // If nothing cached yet, grab page 1 first to learn totals
  if (!cachedPages.includes(1)) {
    const d1 = await fetchPage(1);
    await savePage(supplier, queryKey, 1, d1.items || []);
    totalPages = d1?.pagination?.totalPages ?? totalPages;
    totalItems = d1?.pagination?.totalItems ?? totalItems;

    manifest = await writeManifest(supplier, queryKey, {
      totalPages,
      totalItems,
      startedAt: manifest.startedAt || new Date().toISOString(),
    });
    onProgress?.({ pageNumber: 1, count: (d1.items || []).length, totalPages, totalItems });
    current = 2;
    await sleep(backoffMs);
  } else if (!totalPages) {
    // If page 1 exists locally but totalPages wasn't stored, refetch metadata with a small page
    try {
      const d1 = await fetchPage(1);
      totalPages = d1?.pagination?.totalPages ?? totalPages;
      totalItems = d1?.pagination?.totalItems ?? totalItems;
      manifest = await writeManifest(supplier, queryKey, { totalPages, totalItems });
    } catch {
      // ignore if it fails; we’ll still finish by length check
    }
  }

  // Main loop: keep going until last page
  for (;;) {
    if (totalPages && current > totalPages) break;

    const data = await fetchPage(current);
    const items = data?.items || [];
    const pagination = data?.pagination || {};

    // Update totals if we learn them now
    if (!totalPages && pagination?.totalPages) {
      totalPages = pagination.totalPages;
      totalItems = pagination.totalItems;
    }

    await savePage(supplier, queryKey, current, items);

    // Update manifest progress & timestamps
    manifest = await writeManifest(supplier, queryKey, {
      totalPages,
      totalItems,
      lastPageSaved: current,
      pagesSaved: undefined,            // derived in savePage; we keep manifest consistent
      lastProgressAt: new Date().toISOString(),
    });

    onProgress?.({ pageNumber: current, count: items.length, totalPages, totalItems });

    // stop on last page (use totalPages if known; otherwise stop when short page)
    if ((totalPages && current >= totalPages) || (!totalPages && items.length < itemsPerPage)) {
      await writeManifest(supplier, queryKey, { lastFullSyncAt: new Date().toISOString() });
      break;
    }

    current += 1;
    await sleep(backoffMs);
  }
}
