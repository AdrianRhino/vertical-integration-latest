import localforage from 'localforage';

// Create a store for each supplier's catalog
export function getStore (supplier /* 'abc' | 'beacon' */  ) {
return localforage.createInstance({ name: `catalog-${supplier}` });
}

// save One page of the itmes and update a page manifest
export async function savePage(supplier, queryKey, pageNo, items) {
    const store = getStore(supplier);
    await store.setItem(`${queryKey}:page:${pageNo}`, items);

    const manifestKey = `${queryKey}:manifest`;
    const manifest = (await store.getItem(manifestKey)) || { pages: [], pageCounts: {} };

    if (!manifest.pages.includes(pageNo)) manifest.pages.push(pageNo);
    manifest.pages.sort((a, b) => a - b);

    manifest.pageCounts = manifest.pageCounts || {};
    manifest.pageCounts[pageNo] = Array.isArray(items) ? items.length : 0;

    manifest.pagesSaved = manifest.pages.length;

    await store.setItem(manifestKey, manifest);
}

// Load One page from the cache (returns an array or null)
export async function loadPage(supplier, queryKey, pageNo) {
    const store = getStore(supplier);
    return store.getItem(`${queryKey}:page:${pageNo}`);
}

// get a list of pages we have cached for this queryKey
export async function getPages(supplier, queryKey) {
    const store = getStore(supplier);
    const manifest = await store.getItem(`${queryKey}:manifest`);
    return manifest?.pages || [];
}

// Remove a whole cached query (all pages + manifest)
export async function clearQuery(supplier, queryKey) {
    const store = getStore(supplier);
    const pages = await getPages(supplier, queryKey);
    await Promise.all(pages.map((p) => store.removeItem(`${queryKey}:page:${p}`)));
    await store.removeItem(`${queryKey}:manifest`);
}

export async function searchCache({
    supplier,
    queryKey,
    predicate,
    maxResults = 100,
    onProgress
}) {
    const results = [];
    for await (const { pageNo, items } of iteratePages(supplier, queryKey)) {
        for (const item of items) {
            if (predicate(item)) {
                results.push(item);
                if (results.length >= maxResults) return results;
            }
        }
        onProgress?.({ pageNo, matchesSoFar: results.length });
    }
    return results;
}

export function textMatchPredicate(needle, fields = []) {
    // normalize fields to an array of strings
    const haystackFields = Array.isArray(fields) ? fields
                       : (fields ? [fields] : []); // allow a single string
  
    const s = (needle ?? '').trim().toLowerCase();
    if (!s || haystackFields.length === 0) {
      // no query or no fields -> always false
      return () => false;
    }
  
    // default empty item so we don't explode if caller passes undefined/null
    return (item = {}) =>
      haystackFields.some(f =>
        String(item[f] ?? '').toLowerCase().includes(s)
      );
  }

export async function getAllItems(supplier, queryKey) {
    const out = [];
    for await (const { items } of iteratePages(supplier, queryKey)) out.push(...items);
    return out;
  }

  /** Async generator: yields one page of items at a time */
export async function* iteratePages(supplier, queryKey) {
    const pages = await getPages(supplier, queryKey);
    for (const pageNo of pages.sort((a,b)=>a-b)) {
      const items = await loadPage(supplier, queryKey, pageNo);
      if (Array.isArray(items)) yield { pageNo, items };
    }
  }
  
  /** Async generator: yields items one-by-one (still memory-safe) */
  export async function* iterateItems(supplier, queryKey) {
    for await (const { items } of iteratePages(supplier, queryKey)) {
      for (const it of items) yield it;
    }
  }

// Simple de-dupe helper by itemNumber of productId
export function dedupeById(items, idField /* 'itemNumber' | 'productId' */) {
    const seen = new Set();
    const out = [];
    for (const it of items || []) {
        const id = it?.[idField];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(it);
    }
    return out;
}

export async function readManifest(supplier, queryKey) {
    const store = getStore(supplier);
    return (await store.getItem(`${queryKey}:manifest`)) || {};
}

export async function writeManifest(supplier, queryKey, patch) {
    const store = getStore(supplier);
    const key = `${queryKey}:manifest`;
    const current = (await store.getItem(key)) || {};
    const next = {
        schemaVersion: 1,
        ...current,
        ...patch,
        updatedAt: Date.now().toISOString(),
}
await store.setItem(key, next);
return next;
}


