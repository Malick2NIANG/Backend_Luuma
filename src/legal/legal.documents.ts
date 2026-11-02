/**
 * Version courante des conditions.
 *
 * À INCRÉMENTER à chaque modification de fond. C'est elle qui est enregistrée
 * sur le compte à l'inscription, et qui permettra de repérer les utilisateurs
 * n'ayant accepté qu'une version antérieure pour leur redemander leur accord.
 *
 * Format date pour rester lisible dans une base : « 2026-09-03 » se compare
 * et se raconte mieux qu'un « v3 ».
 */
export const TERMS_VERSION = '2026-09-03';

export type LegalDocumentId = 'terms' | 'privacy';

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  version: string;
  updatedAt: string;
  /** Corps en texte simple. Les titres de section sont préfixés « ## ». */
  body: string;
}

/**
 * ⚠️ TEXTES PROVISOIRES — À FAIRE RELIRE PAR UN JURISTE.
 *
 * Ce sont des trames destinées à rendre le parcours complet et testable, pas
 * des documents opposables. Luuma opère sur deux régimes à la fois — la loi
 * sénégalaise n° 2008-12 et le RGPD pour la diaspora européenne — et exploite
 * un mécanisme d'entiercement, qui soulève des questions de services de
 * paiement dépassant largement ce que je peux rédiger.
 *
 * Servis par l'API plutôt qu'embarqués dans l'application : une correction
 * juridique ne doit pas attendre une mise à jour sur les magasins.
 */
export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: {
    id: 'terms',
    title: "Conditions d'utilisation",
    version: TERMS_VERSION,
    updatedAt: '2026-09-03',
    body: `Ces conditions sont provisoires et seront remplacées par un texte
définitif avant l'ouverture au public.

## 1. Ce qu'est Luuma

Luuma met en relation trois personnes : un client de la diaspora, un
commerçant établi au Sénégal, et un GP — un voyageur qui transporte le colis
dans ses bagages.

Luuma n'est ni vendeur ni transporteur. Luuma organise la rencontre, retient le
paiement jusqu'à la livraison, et intervient en cas de litige.

## 2. Le compte

Un compte est personnel. Vous répondez de son usage et de l'exactitude des
informations que vous fournissez. Un même compte peut être client, commerçant
et GP à la fois.

Ouvrir une boutique ou devenir GP suppose la vérification d'une pièce
d'identité par notre équipe.

## 3. Le paiement et l'entiercement

Le montant est prélevé à la commande et retenu jusqu'à la confirmation de
livraison. Il est ensuite reversé au commerçant et au GP.

Si un GP refuse un colis, la part correspondante est remboursée — les autres
colis de la commande poursuivent leur route.

## 4. Le transport

Le GP s'engage sur un poids et une date de départ. Le poids déclaré du produit
détermine le tarif ; un écart constaté à la remise peut conduire au refus du
colis.

Certains biens ne peuvent pas être transportés : tout ce qui est interdit au
transport aérien, ainsi que les biens dont la vente est réglementée.

## 5. Les avis

Un avis ne peut être laissé qu'après une livraison confirmée. Les avis
mensongers ou injurieux sont retirés.

## 6. Responsabilité

Luuma ne garantit ni la conformité des produits, ni la ponctualité des
voyageurs. Notre rôle est d'encadrer la transaction et d'arbitrer les litiges.

## 7. Résiliation

Vous pouvez fermer votre compte à tout moment. Les commandes en cours doivent
être menées à leur terme, et les données liées aux transactions sont
conservées le temps exigé par la loi.`,
  },

  privacy: {
    id: 'privacy',
    title: 'Politique de confidentialité',
    version: TERMS_VERSION,
    updatedAt: '2026-09-03',
    body: `Ce texte est provisoire et sera remplacé par une version définitive
avant l'ouverture au public.

## Ce que nous collectons

Votre nom, votre email et votre téléphone, pour créer le compte et vous
joindre au sujet d'une commande.

Vos adresses de livraison, pour que le colis arrive.

Votre pièce d'identité, uniquement si vous ouvrez une boutique ou devenez GP.
Elle sert à la vérification et n'est jamais rendue publique.

Le contenu de vos conversations, y compris les messages vocaux, parce qu'ils
font foi en cas de litige.

## Ce que nous ne faisons pas

Nous ne vendons aucune donnée. Nous n'utilisons ni traceur publicitaire, ni
outil de mesure d'audience tiers.

L'application ne conserve sur votre téléphone que ce qui lui est nécessaire :
votre session, votre panier et votre devise d'affichage.

## Pourquoi nous avons le droit

Pour exécuter le contrat qui nous lie lorsque vous commandez. Pour respecter
nos obligations légales, notamment comptables. Et sur la base de votre
consentement pour les seules communications commerciales, que vous pouvez
retirer à tout moment.

## Combien de temps

Les données de compte sont conservées tant que le compte existe. Les données
liées aux commandes et aux paiements sont conservées le temps prévu par la
réglementation. Les pièces d'identité sont supprimées une fois la
vérification aboutie.

## Vos droits

Vous pouvez accéder à vos données, les corriger, les faire supprimer, ou en
demander une copie. Écrivez-nous depuis l'application ou à l'adresse indiquée
ci-dessous.

Vous pouvez également saisir l'autorité compétente : la Commission de
Protection des Données Personnelles au Sénégal, ou l'autorité de votre pays de
résidence dans l'Union européenne.

## Nous contacter

À compléter avant l'ouverture au public.`,
  },
};
