-- Ajoute une video de demonstration (licence CC0, MDN) en 2e diapositive du
-- produit "Sac test E2E", pour tester le carrousel photo + video.
--   Get-Content Backend/scripts/dev-video-demo.sql | docker compose exec -T postgres psql -U luum -d luum_db
UPDATE products
SET images = array_remove(images, 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4')
WHERE name = 'Sac test E2E';

UPDATE products
SET images = images[1:1]
  || ARRAY['https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4']
  || images[2:]
WHERE name = 'Sac test E2E';
