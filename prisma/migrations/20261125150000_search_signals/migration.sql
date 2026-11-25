-- Signaux de recherche : catégories cherchées par un compte, pour personnaliser son fil.
CREATE TABLE "search_signals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT,
    "categories" "ProductCategory"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "search_signals_userId_createdAt_idx" ON "search_signals"("userId", "createdAt");

ALTER TABLE "search_signals" ADD CONSTRAINT "search_signals_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
