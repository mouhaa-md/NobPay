/**
 * What kind of instance this is, as the screens say it. `mock` simulates everything, `sandbox` talks to the Bitnob test
 * API, `real` moves real bitcoin over Lightning (LIGHTNING_RAIL=nwc). Computed on the server (instanceMode in config.ts).
 */
export type InstanceMode = 'mock' | 'sandbox' | 'real';

export const INSTANCE: Record<InstanceMode, { short: string; long: string; icon: string; tone: 'warning' | 'success'; custody: string; about: string }> = {
  mock: {
    short: 'Mode démo',
    long: 'Mode démonstration : paiements simulés',
    icon: 'science',
    tone: 'warning',
    custody: 'Fonds conservés dans vos portefeuilles Bitnob, libérés étape par étape · mode démonstration',
    about:
      "Les factures Lightning et les paiements mobile money sont simulés localement : aucun argent réel ne circule. La signature des événements, la chaîne de preuves et l'ancrage sur Bitcoin (OpenTimestamps) sont, eux, réels.",
  },
  sandbox: {
    short: 'Sandbox Bitnob',
    long: 'Sandbox Bitnob',
    icon: 'verified_user',
    tone: 'success',
    custody: 'Fonds conservés dans vos portefeuilles Bitnob, libérés étape par étape',
    about: "Les appels partent vers l'API Bitnob en mode test. Les factures et les paiements sont créés chez Bitnob ; leur résultat nous parvient par webhook signé.",
  },
  real: {
    short: 'Bitcoin réel · phase pilote',
    long: 'Bitcoin réel · phase pilote',
    icon: 'bolt',
    tone: 'success',
    custody: 'Fonds conservés dans le portefeuille Lightning de NobPay, libérés étape par étape, remboursables si inutilisés',
    about:
      'Vrais bitcoins sur Lightning : le financement est reçu par un portefeuille Nostr Wallet Connect, le fournisseur est payé en sats à son adresse Lightning, et chaque preuve de paiement (preimage) entre dans le registre. Montants plafonnés pendant la phase pilote.',
  },
};
