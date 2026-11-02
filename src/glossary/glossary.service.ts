import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Langues dans lesquelles les explications sont rédigées. */
export const GLOSSARY_LANGUAGES = ['fr', 'en', 'it', 'es'] as const;
export type GlossaryLanguage = (typeof GLOSSARY_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: GlossaryLanguage = 'fr';

export interface GlossaryEntry {
  term: string;
  slug: string;
  /** Formes normalisées à chercher dans un texte : le terme et ses variantes. */
  match: string[];
  category: string | null;
  /** Explication dans la langue demandée, avec repli sur le français. */
  explanation: string;
}

/**
 * Normalisation d'un mot pour la comparaison.
 *
 * Mêmes règles que la recherche plein texte — minuscules, accents retirés —
 * parce que le problème est le même : « thiouraye », « Thiouraye » et
 * « thiouraye » désignent une seule chose, et le wolof commercial s'écrit
 * indifféremment avec ou sans accents.
 */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Le vocabulaire du commerce sénégalais.
 *
 * Servi en bloc au client, qui repère lui-même les termes dans les
 * descriptions qu'il affiche. Ce choix mérite d'être expliqué : annoter les
 * textes côté serveur obligerait à le faire pour chaque produit de chaque
 * liste, à chaque requête. Le glossaire fait quelques centaines d'entrées,
 * quelques dizaines de kilo-octets — le client le récupère une fois, le garde,
 * et le repérage fonctionne ensuite hors ligne.
 */
@Injectable()
export class GlossaryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(language: string): Promise<GlossaryEntry[]> {
    const lang = this.resolveLanguage(language);

    const terms = await this.prisma.glossaryTerm.findMany({
      orderBy: { slug: 'asc' },
    });

    return terms.map((row) => {
      const translations = (row.translations ?? {}) as Record<string, string>;

      return {
        term: row.term,
        slug: row.slug,
        // Le terme lui-même vient en premier : sur un texte contenant à la
        // fois la forme canonique et une variante, c'est elle qui doit gagner.
        match: [normalize(row.term), ...row.aliases.map(normalize)],
        category: row.category,
        // Repli sur le français plutôt que sur une chaîne vide : une
        // explication dans la mauvaise langue reste plus utile que rien,
        // et la diaspora sénégalaise lit majoritairement le français.
        explanation:
          translations[lang] ?? translations[DEFAULT_LANGUAGE] ?? row.term,
      };
    });
  }

  private resolveLanguage(value: string | undefined): GlossaryLanguage {
    // « fr-FR », « en-GB » : on ne garde que la partie langue.
    const base = (value ?? '').split('-')[0].toLowerCase();
    return GLOSSARY_LANGUAGES.includes(base as GlossaryLanguage)
      ? (base as GlossaryLanguage)
      : DEFAULT_LANGUAGE;
  }
}
