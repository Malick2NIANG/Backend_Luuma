-- Traçabilité de l'acceptation des conditions générales.
--
-- Les trois colonnes sont nullables, et volontairement : les comptes créés
-- avant la mise en place du dispositif n'ont rien accepté. Leur poser une
-- valeur par défaut reviendrait à fabriquer une preuve d'acceptation qui
-- n'a jamais eu lieu. `termsVersion` restant NULL, `needsAcceptance` sera
-- vrai pour eux et l'application le leur redemandera.
ALTER TABLE "users" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "termsVersion" TEXT;

-- Une date plutôt qu'un booléen : savoir QUAND l'accord commercial a été
-- donné fait partie de ce qu'il faut pouvoir produire. NULL = pas d'accord.
ALTER TABLE "users" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
