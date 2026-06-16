-- Enable pgvector extension (Neon has it pre-installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (768-dim for jina-embeddings-v2-base-en)
ALTER TABLE "Article" ADD COLUMN "embedding" vector(768);
