-- Notifications : annulation de commande, et index de lecture du panneau.
ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'ORDER_CANCELLED';

CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx"
  ON "notifications"("userId", "createdAt");
