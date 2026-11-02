import type { Sector } from './types';

/**
 * English wording of the sectors and of their template steps, for the English pages. The French text in templates.ts
 * stays the source (it is what a project stores); a test fails if a template step has no English counterpart.
 */

export const SECTORS_EN: Record<Sector, { label: string; tagline: string; note: string }> = {
  immobilier: {
    label: 'Real estate',
    tagline: 'Build, renovate or buy land',
    note: 'The land title is checked before the first payment, then each phase of the works is shown on dated photos.',
  },
  agricole: {
    label: 'Farming',
    tagline: 'Seeds, inputs, harvest and storage',
    note: 'Inputs, sowing, harvest: every purchase is shown by an invoice and a photo of the field.',
  },
  commerce: {
    label: 'Shop',
    tagline: 'Stock, shop and restocking',
    note: 'From the first stock purchase to the shelves: the supplier is paid when the goods arrive.',
  },
  scolarite: {
    label: 'School fees',
    tagline: 'Enrolment, terms and supplies, paid to the school',
    note: 'A child’s school fees, paid to the school term after term, against its receipt.',
  },
  approvisionnement: {
    label: 'Restock',
    tagline: 'Wholesaler order, delivery and shelving',
    note: 'The merchant orders, the wholesaler is paid on delivery: no lost advance, no disputed delivery.',
  },
};

/** French step title -> English. */
export const STEP_TITLES_EN: Record<string, string> = {
  'Vérification du titre foncier': 'Land title check',
  Fondations: 'Foundations',
  'Élévation des murs': 'Walls',
  Dalle: 'Slab',
  Toiture: 'Roof',
  Finitions: 'Finishing',
  'Préparation du sol': 'Soil preparation',
  Semis: 'Sowing',
  'Intrants et entretien': 'Inputs and upkeep',
  'Récolte et stockage': 'Harvest and storage',
  'Vente de la récolte': 'Sale of the harvest',
  'Achat du stock initial': 'Initial stock purchase',
  'Livraison du stock': 'Stock delivery',
  'Mise en rayon': 'Shelving',
  Réapprovisionnement: 'Restocking',
  'Inscription et frais d’entrée': 'Enrolment and entry fees',
  'Fournitures et uniforme': 'Supplies and uniform',
  '1er trimestre': 'Term 1',
  '2e trimestre': 'Term 2',
  '3e trimestre': 'Term 3',
  'Commande confirmée par le grossiste': 'Order confirmed by the wholesaler',
  'Livraison de la marchandise': 'Delivery of the goods',
};

export const stepTitleEn = (fr: string): string => STEP_TITLES_EN[fr] ?? fr;
