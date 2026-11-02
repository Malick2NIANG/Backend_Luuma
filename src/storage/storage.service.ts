import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CATEGORY_RULES,
  MIME_EXTENSIONS,
  StorageCategory,
} from './storage.constants';

export interface PresignedUpload {
  /** URL sur laquelle le client fait un PUT direct. */
  uploadUrl: string;
  /** En-têtes à reproduire exactement, sinon la signature est invalide. */
  headers: Record<string, string>;
  /** Clé à renvoyer à l'API une fois l'upload terminé. */
  key: string;
  /** URL finale : directe si publique, sinon à obtenir via presignDownload. */
  fileUrl: string | null;
  isPublic: boolean;
  expiresInSeconds: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;

  private readonly publicBucket: string;
  private readonly privateBucket: string;
  private readonly publicBaseUrl: string;
  private readonly uploadTtl: number;
  private readonly downloadTtl: number;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';

    this.client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'luum',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'luumluum',
      },
      // MinIO ne gère pas les buckets en sous-domaine : sans ceci, le SDK
      // tenterait de joindre http://luum-public.localhost:9000.
      forcePathStyle: true,
    });

    this.publicBucket = process.env.S3_BUCKET_PUBLIC ?? 'luum-public';
    this.privateBucket = process.env.S3_BUCKET_PRIVATE ?? 'luum-private';
    this.publicBaseUrl = (process.env.S3_PUBLIC_URL ?? endpoint).replace(
      /\/$/,
      '',
    );
    this.uploadTtl = Number(process.env.S3_PRESIGN_UPLOAD_TTL ?? 900);
    this.downloadTtl = Number(process.env.S3_PRESIGN_DOWNLOAD_TTL ?? 3600);
  }

  private bucketFor(category: StorageCategory): string {
    return CATEGORY_RULES[category].isPublic
      ? this.publicBucket
      : this.privateBucket;
  }

  /**
   * Génère une URL d'upload direct vers le stockage.
   *
   * Les octets ne transitent jamais par l'API : sur mobile, faire remonter
   * une photo de 8 Mo ou un vocal à travers NestJS mobiliserait le serveur
   * pour rien et multiplierait les délais.
   */
  async presignUpload(params: {
    userId: string;
    category: StorageCategory;
    contentType: string;
    contentLength: number;
  }): Promise<PresignedUpload> {
    const rule = CATEGORY_RULES[params.category];

    if (!rule.mimeTypes.includes(params.contentType)) {
      throw new BadRequestException(
        `Format non accepté pour « ${params.category} ». ` +
          `Formats autorisés : ${rule.mimeTypes.join(', ')}.`,
      );
    }

    if (params.contentLength > rule.maxBytes) {
      const maxMb = Math.round(rule.maxBytes / (1024 * 1024));
      throw new BadRequestException(
        `Fichier trop volumineux : ${maxMb} Mo maximum pour « ${params.category} ».`,
      );
    }

    const extension = MIME_EXTENSIONS[params.contentType] ?? 'bin';
    // Le userId dans la clé rend la propriété vérifiable sans consulter la
    // base, et empêche d'écraser le fichier d'un autre : la signature ne
    // couvre que cette clé précise.
    const key = `${params.category}/${params.userId}/${randomUUID()}.${extension}`;
    const bucket = this.bucketFor(params.category);

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: params.contentType,
        ContentLength: params.contentLength,
      }),
      { expiresIn: this.uploadTtl },
    );

    return {
      uploadUrl,
      headers: {
        'Content-Type': params.contentType,
        'Content-Length': String(params.contentLength),
      },
      key,
      fileUrl: rule.isPublic
        ? `${this.publicBaseUrl}/${bucket}/${key}`
        : null,
      isPublic: rule.isPublic,
      expiresInSeconds: this.uploadTtl,
    };
  }

  /**
   * URL directe d'un fichier public.
   *
   * Réservée aux catégories publiques : sur un bandeau de stories ou une
   * grille de produits, signer une URL par vignette coûterait autant de
   * requêtes que d'images.
   */
  publicUrl(key: string): string {
    const category = key.split('/')[0] as StorageCategory;
    return `${this.publicBaseUrl}/${this.bucketFor(category)}/${key}`;
  }

  /** URL de lecture temporaire pour un fichier privé (KYC, colis, vocal). */
  async presignDownload(key: string): Promise<string> {
    const category = key.split('/')[0] as StorageCategory;
    const bucket = this.bucketFor(category);

    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: this.downloadTtl },
    );
  }

  /**
   * Confirme qu'un fichier a bien été déposé.
   *
   * Une URL présignée peut être demandée sans jamais être utilisée : sans ce
   * contrôle, un produit pourrait référencer une image inexistante.
   */
  async assertUploaded(key: string): Promise<void> {
    const category = key.split('/')[0] as StorageCategory;

    if (!(category in CATEGORY_RULES)) {
      throw new BadRequestException('Clé de fichier invalide.');
    }

    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketFor(category),
          Key: key,
        }),
      );
    } catch {
      throw new NotFoundException(
        "Fichier introuvable : l'envoi n'a pas abouti.",
      );
    }
  }

  /** Vrai si la clé appartient à cet utilisateur (préfixe de la clé). */
  isOwnedBy(key: string, userId: string): boolean {
    return key.split('/')[1] === userId;
  }

  /**
   * Contrôle complet avant d'associer un fichier à une entité métier.
   *
   * Les trois vérifications sont indissociables :
   *  - la catégorie, sinon une clé `kyc/` pourrait être jointe comme vocal ;
   *  - la propriété, sinon connaître la clé d'autrui suffirait à se
   *    l'approprier — un GP pourrait déclarer la pièce d'identité d'un tiers ;
   *  - l'existence, car une URL présignée peut être demandée sans être suivie
   *    d'un envoi, laissant une référence vers un fichier fantôme.
   */
  async assertOwnedUpload(
    key: string,
    userId: string,
    expectedCategory: StorageCategory,
  ): Promise<void> {
    if (key.split('/')[0] !== expectedCategory) {
      throw new BadRequestException(
        `Ce fichier n'est pas de type « ${expectedCategory} ».`,
      );
    }

    if (!this.isOwnedBy(key, userId)) {
      throw new ForbiddenException("Ce fichier ne vous appartient pas.");
    }

    await this.assertUploaded(key);
  }

  async delete(key: string): Promise<void> {
    const category = key.split('/')[0] as StorageCategory;

    if (!(category in CATEGORY_RULES)) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketFor(category),
          Key: key,
        }),
      );
    } catch (error) {
      // Un fichier orphelin coûte quelques kilo-octets ; faire échouer la
      // requête métier pour autant serait disproportionné.
      this.logger.warn(`Suppression impossible pour ${key}: ${String(error)}`);
    }
  }
}
