// supabase/functions/beacon-sync-db/index.ts
//
// One-file Edge Function that:
//  - Logs into Beacon using beaconUsername/beaconPass (env or request body)
//  - Pages /v1/rest/com/becn/itemlist (pageNumber/pageSize; pageSize<=30)
//  - Maps fields per your exact spec
//  - Upserts into "products" (PK: supplier+itemnumber)
//  - Supports "test" (dry-run) flag
//  - Stops within a time budget and returns nextPage
//
// ---------- HOW TO CALL ----------
// POST JSON:
// {
//   "test": true,                 // dry run; false to write
//   "accountId": "557799",        // optional (default "557799")
//   "startPage": 1,               // optional (default 1)
//   "pageSize": 30,               // optional (default 21; clamped to <= 30)
//   "maxPagesPerRun": 10,         // optional (default 10)
//   "budgetMs": 20000,            // optional (default 20000)
//   "username": "...",            // optional; else env beaconUsername
//   "password": "...",            // optional; else env beaconPass
//   "siteId": "homeSite",         // optional; default "homeSite"
//   "persistentLoginType": "RememberMe", // optional; default "RememberMe"
//   "userAgentHint": "desktop",   // optional; default "desktop"
//   "apiSiteId": "UAT"            // optional; default "UAT"
// }
//
// ---------- REQUIRED SECRETS ----------
// - beaconUsername
// - beaconPass
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// --------------------------------------
// supabase/functions/beacon-products/index.ts
//
// Beacon → Supabase writer (cron-friendly)
// - Supports GET (query params) and POST (JSON)
// - Logs in to Beacon (cookie auth)
// - Paginates /v1/rest/com/becn/itemlist with pageSize<=30
// - Maps to your columns and upserts into "products" (PK: supplier,itemnumber)
// - Returns a clear summary (write mode, items fetched/written, nextPage)
//
// Required secrets: beaconUsername, beaconPass, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional secret:  CRON_SECRET (if set, requires header "x-cron-secret" to match)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSetCookies } from "https://deno.land/std@0.224.0/http/cookie.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
/** -------------------- Config -------------------- **/ const BEACON_LOGIN_URL = "https://beaconproplus.com/v1/rest/com/becn/login";
const BEACON_ITEMLIST_URL = "https://beaconproplus.com/v1/rest/com/becn/itemlist";
const DEFAULT_ACCOUNT_ID = "557799";
const DEFAULT_PAGE_SIZE = 21; // Beacon default
const MAX_PAGE_SIZE = 30; // Beacon max
const DEFAULT_BUDGET_MS = 20_000; // time guard to avoid timeouts
const DEFAULT_MAX_PAGES_PER_RUN = 10; // secondary guard
const RETURN_SAMPLE_CAP = 3; // small preview for debugging
/** -------------------- Types -------------------- **/ type InputType = {
  test?: boolean;
  debug?: boolean;
  accountId?: string;
  startPage?: number;
  pageSize?: number;
  maxPagesPerRun?: number;
  budgetMs?: number;
  username?: string;
  password?: string;
  siteId?: string;
  persistentLoginType?: string;
  userAgentHint?: string;
  apiSiteId?: string;
};
/** -------------------- Helpers -------------------- **/ const nowMs = (): number => Date.now();
const clampPageSize = (n: number | undefined): number => {
  const val = Number.isFinite(n) ? (n as number) : DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(val, MAX_PAGE_SIZE));
};
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: Error | null = null;
  for(let i = 1; i <= attempts; i++){
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await new Promise((r)=>setTimeout(r, 200 * i));
        continue;
      }
      const txt = await res.text().catch(()=>"");
      throw new Error(`HTTP ${res.status}: ${txt}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      await new Promise((r)=>setTimeout(r, 200 * i));
    }
  }
  throw lastErr ?? new Error("Unknown error in fetchWithRetry");
}
/** ABC-style stringify for TEXT columns */ function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return null;
  const t = String(v).toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  return null;
}
/** -------------------- Supabase client -------------------- **/ function sb() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, {
    auth: {
      persistSession: false
    }
  });
}
/** -------------------- Beacon auth -------------------- **/ async function beaconLogin(input: InputType): Promise<string> {
  const username = input.username ?? Deno.env.get("beaconUsername");
  const password = input.password ?? Deno.env.get("beaconPass");
  if (!username || !password) throw new Error("Missing Beacon credentials (beaconUsername/beaconPass).");
  const payload = {
    username,
    password,
    siteId: input.siteId ?? "homeSite",
    persistentLoginType: input.persistentLoginType ?? "RememberMe",
    userAgent: input.userAgentHint ?? "desktop",
    apiSiteId: input.apiSiteId ?? "UAT"
  };
  const res = await fetchWithRetry(BEACON_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const setCookies = getSetCookies(res.headers);
  if (!setCookies || setCookies.length === 0) {
    const txt = await res.text().catch(()=>"");
    throw new Error(`Beacon login succeeded but no cookies were set. Raw response: ${txt}`);
  }
  return setCookies.map((c)=>`${c.name}=${c.value}`).join("; ");
}
/** -------------------- Beacon fetch page -------------------- **/ async function fetchItemPage(cookies: string, accountId: string, pageNumber: number, pageSize: number): Promise<unknown[]> {
  const url = new URL(BEACON_ITEMLIST_URL);
  url.searchParams.set("accountId", accountId);
  url.searchParams.set("pageNumber", String(pageNumber));
  url.searchParams.set("pageSize", String(pageSize));
  const res = await fetchWithRetry(url.toString(), {
    method: "GET",
    headers: {
      Cookie: cookies,
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (SupabaseEdge)"
    }
  });
  let data;
  try {
    data = await res.json();
  } catch  {
    return [];
  }
  const items = Array.isArray(data?.items) && data.items || Array.isArray(data?.data) && data.data || Array.isArray(data?.products) && data.products || Array.isArray(data) && data || [];
  return items;
}
/** -------------------- Mapping (Beacon -> products row) -------------------- **/ function mapBeaconToProductsRow(it: any): {
  supplier: string;
  sku: string;
  branches: string;
  color: string;
  dimensions: string;
  familyid: string;
  familyitems: string;
  familyname: string;
  finish: string;
  hierarchy: string;
  images: string;
  isdimensional: string;
  itemdescription: string;
  itemnumber: string;
  lastmodifieddate: string;
  marketingdescription: string;
  prop65warnings: string;
  specifications: string;
  status: string;
  suppliername: string;
  uoms: string;
  weights: string;
  updated_at: string;
} {
  const itemNumber = it?.itemNumber ?? "";
  return {
    supplier: "Beacon",
    // Your updated Beacon-specific mapping (objects stringified via s()):
    sku: s(itemNumber),
    branches: s(it.branches),
    color: s(it.color),
    dimensions: s(it.dimensions),
    familyid: s(it.productId),
    familyitems: s(it.familyItems),
    familyname: s(it.baseProductName ?? it.productName ?? it.internalProductName),
    finish: s(it.finish),
    hierarchy: s(it.categories),
    images: s({
      productImage: it.productImage,
      itemImage: it?.currentSKU?.itemImage,
      swatchImage: it?.currentSKU?.swatchImage,
      productOnErrorImage: it.productOnErrorImage,
      productAdditionalOnErrorImage: it.productAdditionalOnErrorImage
    }),
    isdimensional: s(toBool(it.isDimensional)),
    itemdescription: s(it.longDesc ?? it.shortDesc ?? it?.currentSKU?.skuShortDesc ?? ""),
    itemnumber: s(itemNumber),
    lastmodifieddate: s(it.lastModifiedDate),
    marketingdescription: s(it.baseProductName ?? it.productName ?? ""),
    prop65warnings: s(it.prop65Warnings),
    specifications: s(it.specification),
    status: s(it.status),
    suppliername: s(it.brand),
    uoms: s(it.uoms),
    weights: s(it.weights),
    updated_at: new Date().toISOString()
  };
}
/** -------------------- Upsert + robust verify -------------------- **/ async function upsertProductsAndCount(rows: ReturnType<typeof mapBeaconToProductsRow>[]): Promise<{ written: number; dbError: string | null }> {
  if (!rows.length) return {
    written: 0,
    dbError: null
  };
  const client = sb();
  // Try upsert; if it "succeeds" with no returned rows, verify existence
  const { error: upsertError } = await client.from("products").upsert(rows, {
    onConflict: "supplier,itemnumber"
  });
  if (upsertError) {
    return {
      written: 0,
      dbError: upsertError.message ?? String(upsertError)
    };
  }
  const keys = rows.map((r)=>r.itemnumber).filter((k): k is string => Boolean(k && k !== ""));
  if (keys.length === 0) {
    return {
      written: 0,
      dbError: "No valid itemnumbers to verify"
    };
  }
  const { data: verify, error: selErr } = await client.from("products").select("itemnumber").eq("supplier", "Beacon").in("itemnumber", keys);
  if (selErr) {
    return {
      written: 0,
      dbError: selErr.message ?? String(selErr)
    };
  }
  return {
    written: Array.isArray(verify) ? verify.length : 0,
    dbError: null
  };
}
/** -------------------- Handler (GET or POST) -------------------- **/ serve(async (req: Request): Promise<Response> => {
  // OPTIONAL: protect cron with shared secret
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET) {
    const got = req.headers.get("x-cron-secret");
    if (!got || got !== CRON_SECRET) {
      return new Response(JSON.stringify({
        ok: false,
        error: "unauthorized"
      }), {
        status: 401
      });
    }
  }
  const url = new URL(req.url);
  const isGET = req.method === "GET";
  // Uniform parsing for GET/POST
  const parseBool = (v: string | null | undefined, def = false): boolean=>{
    if (v == null) return def;
    const t = String(v).trim().toLowerCase();
    return t === "true" || t === "1" || t === "yes";
  };
  const parseNum = (v: string | null | undefined): number | undefined => v == null ? undefined : Number(v);
  let input: InputType = {};
  if (!isGET) {
    try {
      input = await req.json() as InputType;
    } catch  {
      input = {};
    }
  } else {
    const qp = (k: string)=>url.searchParams.get(k);
    input = {
      test: parseBool(qp("test"), false),
      debug: parseBool(qp("debug"), false),
      accountId: qp("accountId") ?? undefined,
      startPage: parseNum(qp("startPage")),
      pageSize: parseNum(qp("pageSize")),
      maxPagesPerRun: parseNum(qp("maxPagesPerRun")),
      budgetMs: parseNum(qp("budgetMs")),
      username: qp("username") ?? undefined,
      password: qp("password") ?? undefined,
      siteId: qp("siteId") ?? undefined,
      persistentLoginType: qp("persistentLoginType") ?? undefined,
      userAgentHint: qp("userAgentHint") ?? undefined,
      apiSiteId: qp("apiSiteId") ?? undefined
    };
  }
  const test = Boolean(input.test);
  const accountId = input.accountId ?? DEFAULT_ACCOUNT_ID;
  const pageSize = clampPageSize(input.pageSize);
  const maxPagesPerRun = Math.max(1, input.maxPagesPerRun ?? DEFAULT_MAX_PAGES_PER_RUN);
  const budgetMs = Math.max(5_000, input.budgetMs ?? DEFAULT_BUDGET_MS);
  let page = Math.max(1, input.startPage ?? 1); // if you want checkpointing, we can add it
  const started = nowMs();
  let pagesFetched = 0;
  let itemsFetched = 0;
  let itemsWritten = 0;
  let skippedMissingItemNumber = 0;
  const sample: ReturnType<typeof mapBeaconToProductsRow>[] = [];
  let lastDbError: string | null = null;
  try {
    const cookies = await beaconLogin(input);
    while(pagesFetched < maxPagesPerRun && nowMs() - started < budgetMs){
      const items = await fetchItemPage(cookies, accountId, page, pageSize);
      if (!items || items.length === 0) break;
      itemsFetched += items.length;
      const mapped = items.map(mapBeaconToProductsRow).filter((r)=>{
        const ok = r.itemnumber && r.itemnumber !== "";
        if (!ok) skippedMissingItemNumber++;
        return ok;
      });
      if (sample.length < RETURN_SAMPLE_CAP) {
        const remaining = RETURN_SAMPLE_CAP - sample.length;
        sample.push(...mapped.slice(0, Math.max(0, remaining)));
      }
      if (!test && mapped.length) {
        const { written, dbError } = await upsertProductsAndCount(mapped);
        itemsWritten += written;
        lastDbError = dbError;
        if (dbError) break; // stop early on DB error
      }
      pagesFetched++;
      page++;
    // optional gentle delay: await new Promise(r => setTimeout(r, 50));
    }
    const elapsedMs = nowMs() - started;
    return new Response(JSON.stringify({
      ok: true,
      endpoint: "beacon-products",
      writeMode: test ? "dry-run" : "writer",
      targetTable: "products",
      supplier: "Beacon",
      accountId,
      pageSizeUsed: pageSize,
      pagesFetched,
      itemsFetched,
      itemsWritten,
      skippedMissingItemNumber,
      nextPage: page,
      elapsedMs,
      parsed: {
        test,
        accountId,
        startPage: input.startPage ?? 1,
        pageSize,
        maxPagesPerRun,
        budgetMs
      },
      sample,
      dbError: lastDbError || undefined
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      endpoint: "beacon-products",
      error: e instanceof Error ? e.message : String(e)
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
