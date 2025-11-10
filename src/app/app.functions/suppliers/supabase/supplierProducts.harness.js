/* eslint-disable no-console */
// Lightweight smoke test runner for supplierProducts ladder
// Usage examples:
//   node supplierProducts.harness.js --supplier=ABC --query=12345
//   node supplierProducts.harness.js --mode=smoke

const { main } = require("./supplierProducts");
const searchConfig = require("../../../config/search.json");

const DEFAULT_PAGE_SIZE = 5;

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith("--")) return acc;
    const [key, rawValue] = arg.substring(2).split("=");
    acc[key] = rawValue === undefined ? true : rawValue;
    return acc;
  }, {});
}

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

async function runSingle({ supplier, query = "", cursor = null, pageSize = DEFAULT_PAGE_SIZE }) {
  console.log(`\n🔍 Running ladder for supplier=${supplier} query="${query}" cursor=${cursor || "∅"}`);

  const parameters = {
    supplier,
    q: query,
    pageSize: Number(pageSize) || DEFAULT_PAGE_SIZE,
  };

  if (cursor) {
    try {
      parameters.cursor = typeof cursor === "string" ? JSON.parse(cursor) : cursor;
    } catch (error) {
      console.warn("Failed to parse cursor, ignoring:", error.message);
    }
  }

  const result = await main({ parameters });
  const payload = normalisePayload(result);

  console.log(
    `   → status=${payload.statusCode} success=${payload.body?.success ?? "?"} items=${
      payload.body?.items?.length ?? 0
    } sourceStep=${payload.body?.sourceStep || payload.body?.meta?.sourceStep || "?"}`
  );
  console.log(`     nextCursor=${payload.body?.nextCursor ? JSON.stringify(payload.body.nextCursor) : "∅"}`);

  return payload;
}

async function runSmokeSuite() {
  const suppliers = Object.keys(searchConfig.suppliers || {});
  if (!suppliers.length) {
    console.warn("No suppliers configured in search.json; smoke suite skipped.");
    return;
  }

  for (const supplier of suppliers) {
    const config = searchConfig.suppliers[supplier] || {};
    console.log(`\n===== ${supplier} =====`);

    await runSingle({ supplier, query: "", pageSize: DEFAULT_PAGE_SIZE });

    const skuQuery = config.smokeTest?.sku;
    if (skuQuery) {
      await runSingle({ supplier, query: skuQuery, pageSize: DEFAULT_PAGE_SIZE });
    } else {
      console.log("   ⚠️  No smokeTest.sku configured – skipping SKU ladder check");
    }

    const fuzzyQuery = config.smokeTest?.fuzzy || config.featuredQueries?.[0];
    if (fuzzyQuery) {
      await runSingle({ supplier, query: fuzzyQuery, pageSize: DEFAULT_PAGE_SIZE });
    } else {
      console.log("   ⚠️  No fuzzy query configured – skipping fuzzy ladder check");
    }
  }
}

function normalisePayload(result) {
  const envelope = result?.response || result || {};
  const statusCode = envelope.statusCode || envelope.status || 200;
  let body = envelope.body ?? envelope;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      console.warn("Failed to parse response body", error.message);
    }
  }

  if (body && typeof body === "object" && "body" in body && body.body) {
    body = body.body;
  }

  return { statusCode, body };
}

async function mainAsync() {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const options = parseArgs(process.argv.slice(2));

  if (options.supplier || options.query || options.cursor) {
    if (!options.supplier) {
      throw new Error("Please provide --supplier=ABC when running a single test.");
    }
    await runSingle(options);
  } else {
    await runSmokeSuite();
  }
}

mainAsync()
  .then(() => {
    console.log("\n✅ Smoke suite complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Smoke suite failed:", error);
    process.exit(1);
  });

