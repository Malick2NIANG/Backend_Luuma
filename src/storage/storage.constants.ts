/**
 * Catégories de fichiers Luuma.
 *
 * Chaque catégorie fixe sa visibilité, ses types MIME et sa taille maximale.
 * Le cloisonnement public/privé est structurel, pas déclaratif : un document
 * d'identité atterrit dans un bucket que personne ne peut lister, et un
 * message vocal n'est lisible que via une URL présignée à durée courte.
 */

export const STORAGE_CATEGORIES = [
  'product',
  'avatar',
  'kyc',
  'package',
  'voice',
  'chat',
  'story',
] as const;

export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

export interface CategoryRule {
  /** true = bucket public (lecture anonyme), false = bucket privé. */
  isPublic: boolean;
  mimeTypes: readonly string[];
  maxBytes: number;
}

const MB = 1024 * 1024;

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

/**
 * Formats audio réellement produits par les mobiles :
 * iOS enregistre en m4a/aac, Android en m4a ou webm/opus selon le préréglage.
 */
/** Formats produits par les mobiles : H.264 en .mp4 sur iOS comme Android. */
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;

const AUDIO_MIME_TYPES = [
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
  'audio/webm',
  'audio/ogg',
] as const;

export const CATEGORY_RULES: Record<StorageCategory, CategoryRule> = {
  // Vitrine : doit être lisible sans authentification.
  //
  // Vidéos acceptées au même titre que les photos. Sur du textile, une vidéo
  // de trois secondes montre la tenue du tissu, sa brillance et son tombé —
  // ce qu'aucune photo ne rend. 30 Mo, comme les stories, pour laisser passer
  // un plan court filmé au téléphone.
  product: {
    isPublic: true,
    mimeTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES],
    maxBytes: 30 * MB,
  },
  avatar: { isPublic: true, mimeTypes: IMAGE_MIME_TYPES, maxBytes: 4 * MB },

  // Pièce d'identité : jamais publique, sous aucun prétexte.
  kyc: { isPublic: false, mimeTypes: IMAGE_MIME_TYPES, maxBytes: 12 * MB },

  // Preuves de livraison : servent en cas de litige, donc privées.
  package: { isPublic: false, mimeTypes: IMAGE_MIME_TYPES, maxBytes: 8 * MB },

  // Contenu de conversation : privé, réservé aux participants.
  voice: { isPublic: false, mimeTypes: AUDIO_MIME_TYPES, maxBytes: 10 * MB },

  // Pièces jointes de conversation. Catégorie distincte de `package` : une
  // photo échangée dans le fil n'a pas la valeur probante d'une preuve de
  // livraison, et ne doit pas se confondre avec elle en cas de litige.
  chat: {
    isPublic: false,
    mimeTypes: [...IMAGE_MIME_TYPES, 'application/pdf'],
    maxBytes: 10 * MB,
  },

  // Médias de story. Publics : une story est une vitrine, et la restreindre au
  // bucket privé imposerait une URL présignée par vignette — insoutenable sur
  // un bandeau qui en affiche dix. La confidentialité est assurée en amont,
  // par la liste de diffusion, pas par le stockage.
  //
  // 30 Mo pour laisser passer une vidéo courte filmée au téléphone.
  story: {
    isPublic: true,
    mimeTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES],
    maxBytes: 30 * MB,
  },
};

/** Extension déduite du type MIME — jamais du nom de fichier client. */
export const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};
