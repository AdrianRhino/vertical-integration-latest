# Debugging Checklist for 502 Error

## Step-by-Step Debugging Process

### 1. Check Serverless Function Logs
**Location:** HubSpot CLI terminal or HubSpot Developer Console

**Look for:**
- `=== supplierProducts START ===` - Confirms function is being called
- `✓ Environment variables found` - Confirms secrets are loaded
- `✓ Supabase client created` - Confirms client initialization
- `Parameters: { supplier, q, limit, afterId }` - Shows what parameters were received
- `❌ SUPABASE ERROR:` - Shows the actual Supabase error details

### 2. Common Issues to Check

#### A. Environment Variables Missing
**Symptoms:**
- Error before "✓ Environment variables found"
- Error message: "Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"

**Fix:**
- Verify secrets are set in HubSpot for `supplierProducts` function
- Check `serverless.json` has correct secret names

#### B. Table/Column Doesn't Exist
**Symptoms:**
- Error code: `PGRST116` or `42P01`
- Error message mentions "relation" or "column" not found

**Fix:**
- Verify `products` table exists in Supabase
- Verify column names match: `id`, `supplier`, `sku`, `product_name`, etc.
- Check table name is lowercase (PostgreSQL is case-sensitive)

#### C. Wrong Supplier Value
**Symptoms:**
- Query executes but returns 0 rows
- Supplier value doesn't match database values

**Fix:**
- Check what supplier values exist in database (should be "ABC", "SRS", "BEACON" - uppercase)
- Verify the supplier parameter is being passed correctly

#### D. Search Query Syntax Issue
**Symptoms:**
- Error code: `PGRST301` or similar
- Error mentions "function" or "syntax"

**Fix:**
- Currently using single `.ilike()` for testing
- Once working, can add back `.or()` for multi-column search

### 3. What to Look For in Logs

**Success Path:**
```
=== supplierProducts START ===
Context: {...}
Environment check...
✓ Environment variables found
Creating Supabase client...
✓ Supabase client created
Parameters: { supplier: 'ABC', q: '', limit: 250, afterId: null }
Building base query...
✓ Base query built with supplier filter: ABC
No search query provided
Executing query...
✓ Query successful!
Data returned: 50 rows
First row sample: {...}
=== supplierProducts END ===
```

**Error Path:**
```
=== supplierProducts START ===
...
❌ SUPABASE ERROR:
Error code: PGRST116
Error message: relation "public.products" does not exist
Error hint: ...
```

### 4. Testing Steps

1. **Test without search query:**
   - Call function with `q: ""` or no `q` parameter
   - This tests basic table access

2. **Test with single column search:**
   - Currently configured to search only `sku` column
   - This isolates the `.or()` issue

3. **Test with correct supplier:**
   - Verify supplier value matches database exactly
   - Check case sensitivity

4. **Check Supabase Dashboard:**
   - Go to Supabase Dashboard → Table Editor
   - Verify table structure matches query
   - Check sample data exists

### 5. Next Steps After Debugging

Once you identify the issue:
- If it's a table/column issue → Fix database schema
- If it's a search syntax issue → Adjust query syntax
- If it's environment variables → Set secrets in HubSpot
- If single `.ilike()` works → Uncomment `.or()` and test multi-column search

