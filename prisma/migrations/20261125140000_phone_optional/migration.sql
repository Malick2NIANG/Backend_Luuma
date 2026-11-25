-- Connexion Google : le compte est créé sans numéro de téléphone, demandé
-- ensuite dans l'application. L'unicité est conservée (plusieurs NULL sont
-- admis par Postgres).
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
