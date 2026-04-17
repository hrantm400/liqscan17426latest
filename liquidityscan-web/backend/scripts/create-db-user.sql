-- Step 1: Create user and database (run as postgres)
-- Run: psql -U postgres -h localhost -f scripts/create-db-user.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'liquidityscan') THEN
    CREATE ROLE liquidityscan WITH LOGIN PASSWORD 'liquidityscan_password';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE DATABASE liquidityscan_db OWNER liquidityscan;
