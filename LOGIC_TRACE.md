# Logic Trace for supplierProducts.js - When Does 502 Error Occur?

## Flow Diagram

```
START
  ↓
[1] Load Supabase client library
    ├─ SUCCESS → Continue
    └─ FAIL → Throw error → Catch block → Return 500
  ↓
[2] Check environment variables (assertEnv)
    ├─ SUCCESS → Continue
    └─ FAIL → Throw error → Catch block → Return 500
  ↓
[3] Create Supabase client
    ├─ SUCCESS → Continue
    └─ FAIL → Throw error → Catch block → Return 500
  ↓
[4] Extract parameters (supplier, q, limit, afterId)
    └─ Always succeeds (uses defaults)
  ↓
[5] Validate supplier parameter
    ├─ EXISTS → Continue
    └─ MISSING → Return 400 (NOT 502)
  ↓
[6] Build base query
    - .from("products")           ← Could fail if table doesn't exist
    - .select("...many columns")  ← Could fail if any column doesn't exist
    - .eq("supplier", supplier)   ← Could fail if supplier column doesn't exist
    - .order("id")                ← Could fail if id column doesn't exist
    - .limit(limit)               ← Should always work
  ↓
[7] Add pagination filter (if afterId exists)
    - .gt("id", afterId)          ← Could fail if id column doesn't exist
  ↓
[8] Add search filter (if q exists)
    - For ABC: .ilike("familyname", pattern)  ← Could fail if familyname doesn't exist
    - For others: .ilike("product_name", pattern) ← Could fail if product_name doesn't exist
  ↓
[9] Execute query: `await query`
    ├─ SUCCESS → error is null/undefined → Continue to success path
    └─ FAIL → error object exists → **RETURN 502** ← THIS IS WHERE 502 HAPPENS
  ↓
[10] Process data (if successful)
     - Map products to normalized format
     - Return 200 with products
```

## When Does 502 Error Occur?

**The 502 error occurs at line 103 when:**
```javascript
const { data, error } = await query;
if (error) {  // ← THIS CONDITION IS TRUE
  return { statusCode: 502, ... };  // ← RETURNS 502
}
```

## What Makes `error` Truthy?

The Supabase query returns an error object when:
1. **Table doesn't exist** - `from("products")` fails
2. **Column doesn't exist** - Any column in `.select()` or filters doesn't exist
3. **Invalid filter syntax** - `.ilike()`, `.eq()`, `.gt()` syntax is wrong
4. **Permission/RLS issue** - Service role key doesn't have access
5. **Network/connection issue** - Can't reach Supabase
6. **Invalid query builder chain** - Query chain is malformed

## Potential Issues in Current Code

### Issue 1: Column Selection (Line 59)
```javascript
.select("id, supplier, itemnumber, itemdescription, familyname, sku, product_name, product_description, product_category, product_image_url, keywords")
```
**Problem:** If ANY of these columns don't exist in the `products` table, Supabase will return an error.

**Solution:** Only select columns that exist for that supplier, or use a wildcard `*` (but that has other issues).

### Issue 2: Search Filter Column (Line 83)
```javascript
query = query.ilike("familyname", searchPattern);
```
**Problem:** If `familyname` column doesn't exist in the database, this will fail.

**Solution:** Check if column exists first, or use a column that definitely exists.

### Issue 3: Supplier Filter (Line 60)
```javascript
.eq("supplier", supplier)
```
**Problem:** If `supplier` column doesn't exist, this will fail.

**Solution:** Verify table schema first.

## Diagnostic Steps

1. **Check if table exists:**
   - Query: `SELECT * FROM products LIMIT 1`
   - If this fails, table doesn't exist

2. **Check if columns exist:**
   - Query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'products'`
   - Compare with columns in `.select()`

3. **Test minimal query:**
   - Start with: `.select("*")` and `.from("products")`
   - Add filters one at a time

4. **Check supplier value:**
   - Verify supplier value matches database (case-sensitive)
   - Database might have "abc" but query uses "ABC"

## Most Likely Causes

Based on the error logs showing empty error fields, the most likely causes are:

1. **Column doesn't exist** - `familyname` column might not exist in the products table
2. **Table schema mismatch** - The actual table structure doesn't match what we're querying
3. **Case sensitivity** - PostgreSQL column names are case-sensitive when quoted

## Recommended Fix

Add a test query first to verify the table structure:

```javascript
// Test query to see what columns actually exist
const testQuery = supabase
  .from("products")
  .select("*")
  .eq("supplier", supplier)
  .limit(1);
  
const { data: testData, error: testError } = await testQuery;

if (testError) {
  // Table or column access issue
  console.error("Test query failed:", testError);
  // Return helpful error
}
```

