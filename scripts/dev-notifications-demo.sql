-- Notifications de demonstration pour client@luum.test (developpement local).
--   Get-Content Backend/scripts/dev-notifications-demo.sql | docker compose exec -T postgres psql -U luum -d luum_db
-- Rejouable : supprime d'abord les precedentes notifications de demo.
DELETE FROM notifications WHERE id LIKE 'demo-%';

INSERT INTO notifications (id, "userId", type, title, body, data, "isRead", "createdAt")
SELECT
  'demo-' || g,
  u.id,
  (ARRAY['ORDER_CONFIRMED','PACKAGE_HANDED_TO_GP','PACKAGE_RECEIVED_BY_GP','ORDER_DELIVERED','PACKAGE_REFUSED','KYC_APPROVED'])[1 + g % 6]::"NotifType",
  (ARRAY[U&'Paiement confirm\00E9','Colis en route vers le GP','Colis pris en charge',U&'Commande livr\00E9e',U&'Un colis a \00E9t\00E9 refus\00E9',U&'Votre boutique est valid\00E9e'])[1 + g % 6],
  CASE WHEN g % 3 = 0
    THEN U&'Le GP n''a pas pu prendre le colis de Fatou Cr\00E9ations. Ces articles vous sont rembours\00E9s ; le reste de la commande #A1B2C3 continue son voyage vers Paris.'
    ELSE U&'Commande #A1B2C3 \2014 notification de d\00E9monstration n\00B0' || g || '.'
  END,
  '{"lien":"/orders"}'::jsonb,
  g > 5,
  now() - (g * 37 || ' minutes')::interval
FROM users u, generate_series(1, 28) g
WHERE u.email = 'client@luum.test';
