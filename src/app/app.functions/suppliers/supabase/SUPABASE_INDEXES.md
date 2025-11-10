<!-- Supplier search ladder index playbook -->

# Supabase Trigram Indexes

The fuzzy leg of the ladder relies on `pg_trgm` similarity. Run the statements below
once per database (adjust schema/table names if you renamed `products`).

```sql
-- Enable pg_trgm just in case it is not already installed
create extension if not exists pg_trgm;

-- Shared composite indexes – tailor the field names to match your columns
create index if not exists products_supplier_id_idx
  on products (supplier, id);

-- ABC catalogue
create index if not exists products_abc_sku_trgm
  on products using gin (itemnumber gin_trgm_ops)
  where supplier = 'ABC';

create index if not exists products_abc_desc_trgm
  on products using gin (itemdescription gin_trgm_ops)
  where supplier = 'ABC';

-- SRS catalogue
create index if not exists products_srs_sku_trgm
  on products using gin ((coalesce(sku, productid::text)) gin_trgm_ops)
  where supplier = 'SRS';

create index if not exists products_srs_desc_trgm
  on products using gin ((coalesce(productdescription, description)) gin_trgm_ops)
  where supplier = 'SRS';

-- Beacon catalogue
create index if not exists products_beacon_sku_trgm
  on products using gin (coalesce(itemnumber, sku) gin_trgm_ops)
  where supplier = 'BEACON';

create index if not exists products_beacon_desc_trgm
  on products using gin (
    coalesce(baseproductname, marketingdescription, description) gin_trgm_ops
  )
  where supplier = 'BEACON';
```

> 💡  If your column names differ, edit the expressions before executing.
>     The ladder only needs one SKU index and one description index per supplier.

### Validation

```sql
select indexname, indexdef
from pg_indexes
where tablename = 'products'
order by indexname;
```

Run the smoke harness afterwards:

```bash
node src/app/app.functions/suppliers/supabase/supplierProducts.harness.js --mode=smoke
```

