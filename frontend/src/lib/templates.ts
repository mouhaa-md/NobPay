import type { ProofKind, Sector } from './types';

export interface SectorMeta {
  id: Sector;
  label: string;
  tagline: string;
  icon: string; // Material Symbols name
  chip: string; // tailwind classes for the small label
  iconColor: string;
  cover: string;
}

export const SECTORS: Record<Sector, SectorMeta> = {
  immobilier: {
    id: 'immobilier',
    label: 'Immobilier',
    tagline: 'Construire, rénover ou acheter un terrain',
    icon: 'apartment',
    chip: 'bg-surface-container text-primary',
    iconColor: 'text-primary',
    cover: '/covers/immobilier.jpg',
  },
  agricole: {
    id: 'agricole',
    label: 'Agricole',
    tagline: 'Semis, intrants, récolte et stockage',
    icon: 'potted_plant',
    chip: 'bg-secondary-container text-on-secondary-container',
    iconColor: 'text-tertiary',
    cover: '/covers/agricole.jpg',
  },
  commerce: {
    id: 'commerce',
    label: 'Commerce',
    tagline: 'Stock, boutique et réapprovisionnement',
    icon: 'storefront',
    chip: 'bg-secondary-fixed text-on-secondary-fixed',
    iconColor: 'text-secondary',
    cover: '/covers/commerce.jpg',
  },
};

export const PROOF_LABEL: Record<ProofKind, string> = {
  titre: 'Titre foncier',
  photos: 'Photos géolocalisées',
  facture: 'Facture',
};

/** Short names for crowded places (chips of the project wizard). */
export const PROOF_SHORT: Record<ProofKind, string> = {
  titre: 'Titre',
  photos: 'Photos',
  facture: 'Facture',
};

export interface StepTemplate {
  title: string;
  share: number; // fraction of the budget
  proofKinds: ProofKind[];
}

/** Default steps pre-filled when a project is created (the funder can edit them). */
export const STEP_TEMPLATES: Record<Sector, StepTemplate[]> = {
  immobilier: [
    { title: 'Vérification du titre foncier', share: 0.05, proofKinds: ['titre'] },
    { title: 'Fondations', share: 0.2, proofKinds: ['photos', 'facture'] },
    { title: 'Élévation des murs', share: 0.25, proofKinds: ['photos', 'facture'] },
    { title: 'Dalle', share: 0.2, proofKinds: ['photos', 'facture'] },
    { title: 'Toiture', share: 0.18, proofKinds: ['photos', 'facture'] },
    { title: 'Finitions', share: 0.12, proofKinds: ['photos', 'facture'] },
  ],
  agricole: [
    { title: 'Préparation du sol', share: 0.15, proofKinds: ['photos', 'facture'] },
    { title: 'Semis', share: 0.15, proofKinds: ['photos', 'facture'] },
    { title: 'Intrants et entretien', share: 0.3, proofKinds: ['photos', 'facture'] },
    { title: 'Récolte et stockage', share: 0.2, proofKinds: ['photos', 'facture'] },
    { title: 'Vente de la récolte', share: 0.2, proofKinds: ['facture'] },
  ],
  commerce: [
    { title: 'Achat du stock initial', share: 0.2, proofKinds: ['facture'] },
    { title: 'Livraison du stock', share: 0.4, proofKinds: ['photos', 'facture'] },
    { title: 'Mise en rayon', share: 0.1, proofKinds: ['photos'] },
    { title: 'Réapprovisionnement', share: 0.3, proofKinds: ['facture'] },
  ],
};

/** Splits a budget (in cents) across a template; the last step absorbs rounding. */
export function allocateBudget(budgetCents: number, template: StepTemplate[]): number[] {
  const amounts = template.map((t) => Math.round((budgetCents * t.share) / 100) * 100);
  const diff = budgetCents - amounts.reduce((a, b) => a + b, 0);
  amounts[amounts.length - 1] += diff;
  return amounts;
}

export const MOBILE_NETWORKS = {
  wave: 'Wave',
  orange_money: 'Orange Money',
  free_money: 'Free Money',
} as const;

/** Countries where the funder can live (diaspora). Flags are rendered with SVG, never emoji. */
export const RESIDENCE_COUNTRIES: { code: string; name: string; dial: string }[] = [
  { code: 'FR', name: 'France', dial: '+33' },
  { code: 'BE', name: 'Belgique', dial: '+32' },
  { code: 'IT', name: 'Italie', dial: '+39' },
  { code: 'ES', name: 'Espagne', dial: '+34' },
  { code: 'DE', name: 'Allemagne', dial: '+49' },
  { code: 'GB', name: 'Royaume-Uni', dial: '+44' },
  { code: 'US', name: 'États-Unis', dial: '+1' },
  { code: 'CA', name: 'Canada', dial: '+1' },
  { code: 'CH', name: 'Suisse', dial: '+41' },
  { code: 'SN', name: 'Sénégal', dial: '+221' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225' },
  { code: 'CM', name: 'Cameroun', dial: '+237' },
];

export const DESTINATION_COUNTRY = { code: 'SN', name: 'Sénégal', currency: 'XOF', currencyLabel: 'FCFA' } as const;
