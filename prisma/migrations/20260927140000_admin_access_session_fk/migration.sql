-- L'accès à l'administration suit le sort de sa session.
--
-- `sessionId` désignait une session sans le dire à Postgres : à la
-- déconnexion, à l'expiration ou lors d'un `revokeSessionsOnPasswordReset`,
-- la ligne survivait — parfois avec un `codeHash` jamais consommé. Rien ne
-- les nettoyait, et elles s'accumulaient.
--
-- Une clé étrangère en cascade remplace la tâche planifiée qu'il aurait fallu
-- écrire, programmer et surveiller. La base tient l'invariant elle-même : pas
-- de session, pas d'élévation.

-- Les orphelines existantes doivent partir d'abord, sinon la contrainte est
-- refusée. Elles ne servent plus à personne : leur session n'existe plus.
DELETE FROM "admin_access"
WHERE "sessionId" NOT IN (SELECT "id" FROM "sessions");

ALTER TABLE "admin_access"
    ADD CONSTRAINT "admin_access_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
