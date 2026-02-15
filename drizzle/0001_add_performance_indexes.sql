-- Performance indexes for Second Brain
-- Run each statement individually against Neon (CONCURRENTLY can't be in a transaction)

-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- HNSW vector index (replaces sequential scan for semantic search)
CREATE INDEX CONCURRENTLY IF NOT EXISTS entries_embedding_hnsw_idx
  ON entries USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN trigram index for ILIKE text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS entries_title_trgm_idx
  ON entries USING gin (title gin_trgm_ops);

-- Partial composite index for non-archived entries (covers 99% of queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS entries_active_category_status_idx
  ON entries (category, status) WHERE archived_at IS NULL;
