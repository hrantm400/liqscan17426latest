-- Step 2: Grant on public schema (run connected to liquidityscan_db)
-- Run: psql -U postgres -h localhost -d liquidityscan_db -f scripts/grant-public.sql

GRANT ALL ON SCHEMA public TO liquidityscan;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO liquidityscan;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO liquidityscan;
