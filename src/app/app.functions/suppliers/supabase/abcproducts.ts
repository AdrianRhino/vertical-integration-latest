// supabase/functions/abc-products/index.ts
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
/* --- ENV --- */ const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ABCCLIENT = Deno.env.get("ABCCLIENT");
const ABCSECRET = Deno.env.get("ABCSECRET");
const CRON_SECRET = Deno.env.get("CRON_SECRET"); // shared secret header for cron
const TOKEN_URL = Deno.env.get("ABC_TOKEN_URL") ?? "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357/v1/token";
const ABC_API_URL = Deno.env.get("ABC_API_URL") ?? "https://partners.abcsupply.com/api/product/v1/items";
const ABC_SCOPE = Deno.env.get("ABC_SCOPE") ?? "product.read";
/* --- Supabase client (server-side; bypasses RLS) --- */ const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: {
    persistSession: false
  }
});
/* --- Helpers (kept from your original style) --- */ function s(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function b64(input) {
  if (typeof btoa === "function") return btoa(input);
  // deno has btoa; fallback kept for completeness
  // @ts-ignore
  return Buffer.from(input).toString("base64");
}
/* --- OAuth --- */ async function getAbcToken() {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", ABC_SCOPE);
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${b64(`${ABCCLIENT}:${ABCSECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`Token request failed: ${resp.status} ${txt}`);
  const data = JSON.parse(txt);
  if (!data?.access_token) throw new Error("No access_token returned");
  return data.access_token;
}
/* --- Mapping (matches your lowercase column names) --- */ function mapToProductsRow(it) {
  return {
    supplier: "abc",
    sku: s(it.sku),
    branches: s(it.branches),
    color: s(it.color),
    dimensions: s(it.dimensions),
    familyid: s(it.familyId),
    familyitems: s(it.familyItems),
    familyname: s(it.familyName),
    finish: s(it.finish),
    hierarchy: s(it.hierarchy),
    images: s(it.images),
    isdimensional: s(it.isDimensional),
    itemdescription: s(it.itemDescription ?? it.description),
    itemnumber: s(it.itemNumber),
    lastmodifieddate: s(it.lastModifiedDate),
    marketingdescription: s(it.marketingDescription),
    prop65warnings: s(it.prop65Warnings),
    specifications: s(it.specifications),
    status: s(it.status),
    suppliername: s(it.supplierName),
    uoms: s(it.uoms),
    weights: s(it.weights),
    updated_at: new Date().toISOString()
  };
}
/* --- Paging + status helpers --- */ async function fetchPage(token, pageNumber, itemsPerPage, embedBranches = false) {
  const url = new URL(ABC_API_URL);
  url.searchParams.set("pageNumber", String(pageNumber));
  url.searchParams.set("itemsPerPage", String(itemsPerPage));
  if (embedBranches) url.searchParams.set("embed", "branches");
  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  const bodyText = await r.text();
  if (!r.ok) throw new Error(`Fetch p${pageNumber} ${r.status} ${bodyText}`);
  return JSON.parse(bodyText);
}
async function getStatus(supplier) {
  const { data, error } = await sb.from("ingest_status").select("*").eq("supplier", supplier).maybeSingle();
  if (error) throw error;
  return data ?? null;
}
async function setStatus(supplier, patch) {
  const payload = {
    supplier,
    updated_at: new Date().toISOString(),
    ...patch
  };
  const { error } = await sb.from("ingest_status").upsert(payload, {
    onConflict: "supplier"
  });
  if (error) throw error;
}
/* --- Main server --- */ serve(async (req)=>{
  try {
    // OPTIONAL: protect with a shared secret for cron/scheduled calls
    const secret = req.headers.get("x-cron-secret");
    if (CRON_SECRET && (!secret || secret !== CRON_SECRET)) {
      return new Response(JSON.stringify({
        ok: false,
        error: "unauthorized"
      }), {
        status: 401
      });
    }
    const url = new URL(req.url);
    // knobs (kept simple; default mirrors your original “single page fetch”)
    const mode = (url.searchParams.get("mode") || "test").toLowerCase(); // "test" | "full"
    const pagesPerRun = Math.max(1, Math.min(Number(url.searchParams.get("pagesPerRun") || (mode === "test" ? 1 : 10)), 50));
    const itemsPerPage = Math.max(50, Math.min(Number(url.searchParams.get("itemsPerPage") || 300), 300));
    const embedBranches = (url.searchParams.get("embedBranches") || "false").toLowerCase() === "true";
    const supplier = (url.searchParams.get("supplier") || "abc").toLowerCase();
    // resume point
    let st = await getStatus(supplier);
    const startPage = st?.next_page ?? 1;
    // re-entrancy guard
    if (st?.running) {
      return new Response(JSON.stringify({
        ok: true,
        message: "already running, skip this tick"
      }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
    await setStatus(supplier, {
      running: true,
      items_per_page: itemsPerPage
    });
    // token once
    const token = await getAbcToken();
    let page = startPage;
    let processed = 0;
    let totalPages = st?.total_pages ?? null;
    // if first time, learn totals and process page 1
    if (!totalPages) {
      const first = await fetchPage(token, page, itemsPerPage, embedBranches);
      totalPages = first?.pagination?.totalPages ?? 1;
      const items = Array.isArray(first?.items) ? first.items : [];
      const rows = items.map(mapToProductsRow).filter((r)=>r.itemnumber);
      if (rows.length) {
        const { error } = await sb.from("products").upsert(rows, {
          onConflict: "supplier,itemnumber"
        });
        if (error) throw error;
      }
      processed++;
      page++;
      await setStatus(supplier, {
        total_pages: totalPages,
        next_page: page
      });
    }
    // process remaining pages for this run budget
    while(processed < pagesPerRun && page <= totalPages){
      const data = await fetchPage(token, page, itemsPerPage, embedBranches);
      const items = Array.isArray(data?.items) ? data.items : [];
      const rows = items.map(mapToProductsRow).filter((r)=>r.itemnumber);
      if (rows.length) {
        const { error } = await sb.from("products").upsert(rows, {
          onConflict: "supplier,itemnumber"
        });
        if (error) throw error;
      }
      processed++;
      page++;
      await setStatus(supplier, {
        next_page: page
      });
    }
    const done = page > totalPages;
    await setStatus(supplier, {
      running: false,
      next_page: done ? 1 : page
    });
    // response mirrors your original “ok + preview” shape when possible
    return new Response(JSON.stringify({
      ok: true,
      supplier,
      mode,
      itemsPerPage,
      pagesPerRun,
      processedPagesThisRun: processed,
      totalPages,
      nextPage: done ? 1 : page,
      done
    }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  } catch (e) {
    // best effort: clear running flag for the default supplier
    try {
      await setStatus("abc", {
        running: false
      });
    } catch  {}
    return new Response(JSON.stringify({
      ok: false,
      stage: "fatal",
      error: e instanceof Error ? e.message : String(e)
    }), {
      status: 500,
      headers: {
        "content-type": "application/json"
      }
    });
  }
});
