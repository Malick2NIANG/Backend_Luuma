-- ============================================================
--  Recherche plein texte — à appliquer APRÈS `prisma migrate dev`
-- ============================================================
--
-- Prisma ne sait pas modéliser une colonne tsvector ni un index GIN : cette
-- partie reste en SQL. Elle est idempotente et peut être rejouée.
--
-- Ce qu'elle apporte, que `LIKE '%...%'` ne fait pas :
--   · « bebe » trouve « bébé »            (unaccent)
--   · « robes » trouve « robe »           (racinisation française)
--   · « bazan » trouve « bazin »          (trigrammes)
--   · le nom pèse plus que la description (pondération A/B/C)
--   · reste rapide à 100 000 produits     (index GIN)

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Configuration de recherche : français + sans accents ────
-- `unaccent` doit s'appliquer AVANT la racinisation, d'où le dictionnaire
-- chaîné. Sans cela, « bébé » et « bebe » produisent deux lexèmes distincts.
DROP TEXT SEARCH CONFIGURATION IF EXISTS luum_fr CASCADE;
CREATE TEXT SEARCH CONFIGURATION luum_fr (COPY = french);
ALTER TEXT SEARCH CONFIGURATION luum_fr
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, french_stem;

-- ── Colonne de recherche des produits ───────────────────────
-- Colonne générée : Postgres la recalcule à chaque écriture, aucun
-- déclencheur à maintenir et aucun risque de désynchronisation.
--
-- Pondération : A le nom, B la sous-catégorie, C la description.
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;
ALTER TABLE products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('luum_fr', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('luum_fr', coalesce("subCategory", '')), 'B') ||
    setweight(to_tsvector('luum_fr', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS products_search_idx
  ON products USING GIN (search_vector);

-- Index trigramme : tolérance aux fautes de frappe et suggestions.
-- Complète le tsvector, qui exige des mots corrects.
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING GIN (name gin_trgm_ops);

-- ── Recherche des boutiques ─────────────────────────────────
ALTER TABLE merchants DROP COLUMN IF EXISTS search_vector;
ALTER TABLE merchants ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('luum_fr', coalesce("shopName", '')), 'A') ||
    setweight(to_tsvector('luum_fr', coalesce(city, '')), 'B') ||
    setweight(to_tsvector('luum_fr', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS merchants_search_idx
  ON merchants USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS merchants_name_trgm_idx
  ON merchants USING GIN ("shopName" gin_trgm_ops);

-- ── Recherche des trajets ───────────────────────────────────
-- Les villes uniquement : c'est ce qu'on cherche dans un trajet.
CREATE INDEX IF NOT EXISTS trips_dest_trgm_idx
  ON trips USING GIN ("destCity" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trips_origin_trgm_idx
  ON trips USING GIN ("originCity" gin_trgm_ops);
