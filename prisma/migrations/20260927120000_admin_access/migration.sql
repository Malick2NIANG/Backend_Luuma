-- Accès à l'espace d'administration, par session.
--
-- Migration écrite à la main, et non générée par `prisma migrate dev` : les
-- colonnes `search_vector` ont été créées en SQL brut hors de l'historique des
-- migrations, donc Prisma voit une dérive et propose une réinitialisation qui
-- détruirait les données. `prisma migrate deploy` applique ce fichier sans
-- rien comparer.

CREATE TABLE "admin_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "elevatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_access_pkey" PRIMARY KEY ("id")
);

-- Une session n'a qu'un état d'accès : redemander un code remplace le précédent.
CREATE UNIQUE INDEX "admin_access_sessionId_key" ON "admin_access"("sessionId");

CREATE INDEX "admin_access_userId_idx" ON "admin_access"("userId");

-- La suppression d'un compte emporte ses élévations.
ALTER TABLE "admin_access"
    ADD CONSTRAINT "admin_access_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
