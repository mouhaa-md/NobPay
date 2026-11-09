export type Lang = 'fr' | 'en';

/** A heading with one emphasised part: `lead` then `em`. */
interface Heading {
  lead: string;
  em: string;
}

export interface LandingCopy {
  htmlLang: string;
  meta: { title: string; description: string };
  nav: { logoLabel: string; navLabel: string; how: string; corridors: string; verify: string; open: string; switchLabel: string; switchTo: string; switchHref: string };
  hero: { title: Heading; sub: string; cta: string; verify: string; tag: string };
  why: {
    eyebrow: string;
    title: Heading;
    text: string;
    stats: { value: string; unit: string; text: string }[];
    sourcePrefix: string;
    sourceUn: string;
    sourceAnd: string;
    sourceIfad: string;
    sourceSuffix: string;
  };
  how: {
    chip: string;
    title: Heading;
    text: string;
    steps: { name: string; bullets: [string, string]; alt: string }[];
  };
  corridors: { eyebrow: string; title: Heading; text: string };
  peek: { eyebrow: string; title: Heading; text: string; ticks: string[]; cta: string; altHome: string; altProject: string };
  rails: { eyebrow: string; title: Heading; text: string; items: { tag: string; title: string; text: string; icon: string }[] };
  verify: {
    eyebrow: string;
    title: Heading;
    text: string;
    cta: string;
    ariaLabel: string;
    checks: { title: string; text: string; wait?: boolean }[];
    example: string;
  };
  faq: { title: Heading; items: { q: string; a: string }[] };
  final: { title: Heading; text: string; open: string; verify: string; copyright: string; footerLabel: string; links: { app: string; verify: string; how: string } };
}

const SOURCE_UN = 'https://news.un.org/en/story/2026/09/1168330';
export const SOURCE_URLS = { un: SOURCE_UN, ifad: 'https://www.ifad.org/en/w/news/remittances-nearly-doubled-in-a-decade-to-reach-us-729-billion-in-2025-new-ifad-report-finds' };

const fr: LandingCopy = {
  htmlLang: 'fr',
  meta: {
    title: 'NobPay · Investissez au pays. Avec preuve.',
    description:
      "NobPay aide la diaspora à financer des projets, des frais de scolarité et des stocks de commerçants au pays : l'argent reste en séquestre et n'est libéré qu'étape par étape, sur preuve, en bitcoin sur Lightning, avec un registre que chacun peut vérifier.",
  },
  nav: { logoLabel: 'NobPay, accueil', navLabel: 'Navigation principale', how: 'Comment ça marche', corridors: 'Couloirs', verify: 'Vérifier un dossier', open: "Ouvrir l'app", switchLabel: 'Langue', switchTo: 'English', switchHref: '/lang/en?next=/en' },
  hero: {
    title: { lead: 'Investissez au pays.', em: 'Avec preuve.' },
    sub: "L'argent de la diaspora reste en séquestre. Il n'est libéré qu'étape par étape, sur preuve, directement au fournisseur, en bitcoin sur Lightning.",
    cta: "Essayer l'application",
    verify: 'Vérifier un dossier',
    tag: 'Prototype · Dakar Bitcoin Hack #4',
  },
  why: {
    eyebrow: 'Le constat',
    title: { lead: "Un transfert déplace l'argent.", em: "Il n'en contrôle pas l'usage." },
    text: "Une maison, un champ, une boutique, l'école d'un enfant : on finance à distance, sur la parole d'un proche. NobPay remplace cette confiance aveugle par des preuves, étape après étape.",
    stats: [
      { value: '124,2', unit: ' Md$', text: 'envoyés par des migrants à leurs familles en Afrique en 2025.' },
      { value: '1 $', unit: ' sur 3', text: 'des envois vers les pays à revenu faible ou intermédiaire arrive en zone rurale, près de 233 Md$ en 2025.' },
      { value: '22', unit: ' Md$ par an', text: 'investis par les familles bénéficiaires dans l’agriculture et l’alimentation rurales (estimation, mêmes pays).' },
    ],
    sourcePrefix: 'Source : IFAD, 14 septembre 2026, relayé par ',
    sourceUn: 'ONU Info',
    sourceAnd: ' et ',
    sourceIfad: "l'IFAD",
    sourceSuffix: '. Ces chiffres décrivent le marché, pas les résultats de NobPay.',
  },
  how: {
    chip: 'Comment ça marche',
    title: { lead: 'Financez, prouvez, libérez,', em: 'vérifiez.' },
    text: "Quatre gestes, tous dans l'application. Ces écrans sont ceux du prototype, avec des données de démonstration.",
    steps: [
      { name: 'Financer', bullets: ['Vous payez une facture Lightning depuis n’importe quel portefeuille.', 'Les fonds restent en séquestre, comptés projet par projet. Ce n’est pas un compte bancaire.'], alt: 'Écran de financement : facture Lightning et code QR' },
      { name: 'Prouver', bullets: ['La personne de confiance sur place ouvre un lien privé, sans compte.', 'Photos datées et localisées, facture, titre foncier, et qui doit être payé.'], alt: 'Écran terrain : photos, facture et fournisseur à payer' },
      { name: 'Libérer', bullets: ['Vous voyez la preuve et les points à vérifier ; sur demande, une IA donne un deuxième avis. Vous décidez.', 'Le fournisseur est payé en sats à son adresse Lightning, et le reçu montre la preuve de paiement.'], alt: 'Écran de confirmation du paiement' },
      { name: 'Vérifier', bullets: ['Chaque événement s’ajoute à un registre enchaîné, ancré sur Bitcoin et copié sur des relais Nostr.', 'N’importe qui le contrôle depuis son navigateur, sans nous.'], alt: "Page publique de vérification d'un dossier" },
    ],
  },
  corridors: {
    eyebrow: 'Trois couloirs, un moteur',
    title: { lead: 'Un même moteur pour', em: 'vos projets au pays' },
    text: "Un projet au pays, une scolarité, le stock d’un commerçant : chacun a ses étapes types. Vous les ajustez, puis chaque paiement dépend d'une preuve.",
  },
  peek: {
    eyebrow: 'Côté financeur',
    title: { lead: 'Tout le projet,', em: 'sur un écran.' },
    text: "Le séquestre, ce qui est libéré, l'étape en cours, la preuve qui attend votre décision : rien n'est caché derrière un relevé.",
    ticks: ['Montants en dollars, avec le cours du bitcoin affiché avant chaque paiement', 'Une seule étape ouverte à la fois, et seulement si le séquestre la couvre', 'Lien privé pour la personne sur place : elle ne voit ni votre solde ni vos fonds'],
    cta: "Essayer l'application",
    altHome: 'Tableau de bord : total en séquestre et équipes sur place',
    altProject: 'Projet : séquestre, avancement et étapes',
  },
  rails: {
    eyebrow: 'Sous le capot',
    title: { lead: 'Des rails ouverts,', em: 'de bout en bout' },
    text: 'Lightning pour entrer et sortir, Bitcoin et Nostr pour prouver. Les secrets restent côté serveur, et chaque réponse d’un portefeuille est vérifiée avant d’être crue.',
    items: [
      { tag: 'Entrée', title: 'Bitcoin Lightning', text: 'Le financeur paie une facture depuis n’importe quel portefeuille. Le serveur ne crédite qu’une fois le paiement confirmé.', icon: 'bolt' },
      { tag: 'Garde', title: 'Deux connexions, deux droits', text: 'Une connexion ne peut que créer des factures (elle ne peut pas dépenser) ; l’autre paie, avec un budget et des plafonds.', icon: 'lock' },
      { tag: 'Sortie', title: 'Adresse Lightning', text: 'Le fournisseur est payé à son adresse, au montant exact, et le reçu porte la preuve de paiement. Mobile money en option (Bitnob).', icon: 'mobile' },
      { tag: 'Preuve', title: 'Bitcoin et Nostr', text: 'L’empreinte du dossier est ancrée avec OpenTimestamps ; chaque événement est aussi publié sur des relais Nostr.', icon: 'currency_bitcoin' },
    ],
  },
  verify: {
    eyebrow: "Verify, don't trust",
    title: { lead: 'Ne nous croyez pas.', em: 'Vérifiez.' },
    text: "Un dossier NobPay se contrôle sans compte et sans nous : votre navigateur recalcule l'empreinte, relit tout le registre, interroge les relais Nostr et Bitcoin.",
    cta: 'Vérifier un dossier',
    ariaLabel: 'Exemple de résultat de vérification',
    checks: [
      { title: 'Le dossier est celui qui a été ancré', text: "L'empreinte recalculée chez vous est identique." },
      { title: "Le registre n'a pas été modifié", text: "Chaque événement contient l'empreinte du précédent." },
      { title: 'Le registre est répliqué sur Nostr', text: 'Les engagements sont retrouvés sur des relais, signés par la clé du projet.' },
      { title: "L'empreinte est dans la blockchain Bitcoin", text: "En attente d'un bloc, en général quelques heures.", wait: true },
    ],
    example: "Exemple de présentation : ce n'est pas un dossier réel.",
  },
  faq: {
    title: { lead: 'Questions', em: 'franches' },
    items: [
      {
        q: 'Où est mon argent pendant le projet ?',
        a: "Dans le portefeuille Lightning de l'instance NobPay, compté projet par projet ; rien n'est libéré sans votre validation. C'est un séquestre tenu par l'opérateur de l'instance : ce n'est ni un compte bancaire ni un service financier agréé. Pendant la phase pilote, des plafonds limitent les montants, et le service se suspend si ce qu'il doit dépasse ce que contiennent ses portefeuilles.",
      },
      {
        q: "Est-ce que cela fonctionne vraiment aujourd'hui ?",
        a: "C'est un prototype open source, réalisé pour le Dakar Bitcoin Hack #4. Selon l'instance, les paiements sont simulés (démonstration), faits sur l'API de test de Bitnob, ou faits avec de vrais sats sous plafond. Le mode est écrit en haut de chaque écran.",
      },
      {
        q: 'Pourquoi Bitcoin et Lightning ?',
        a: "Un paiement Lightning se règle en général en quelques secondes, sans banque, et son reçu contient une preuve de paiement cryptographique que n'importe qui peut contrôler. Le reste de la chaîne (registre, ancrage, Nostr) repose sur le même principe : vérifier plutôt que croire.",
      },
      {
        q: 'Que prouvent l’ancrage Bitcoin et Nostr ?',
        a: "Que le dossier existait tel quel à une date donnée et n'a pas changé depuis, et que des copies indépendantes existent sur des relais. Seules des empreintes sont publiées, jamais vos photos, vos noms ni vos montants. Cela ne prouve pas qu'une photo montre le bon chantier : c'est à vous de le juger avant de payer.",
      },
      {
        q: 'Et l’IA ?',
        a: "Sur demande, une IA (Claude, d'Anthropic) regarde les photos et lit la facture, puis signale ce qui ne colle pas. Elle se trompe parfois : son avis est consultatif, vous décidez. Les photos et la facture ne lui sont envoyées que si vous le demandez, et rien d'autre sur vous.",
      },
      {
        q: 'Dans quels pays ?',
        a: "Le Sénégal d'abord. Lightning n'a pas de frontière, mais il faut un fournisseur capable de le recevoir : sinon, le paiement en mobile money (Wave, Orange Money, Free Money) passe par Bitnob, en test pour l'instant.",
      },
      {
        q: 'Le code est-il ouvert ?',
        a: "Oui, sous licence MIT. La vérification d'un dossier se fait dans votre navigateur et peut être relue ligne par ligne.",
      },
    ],
  },
  final: {
    title: { lead: 'Investissez au pays.', em: 'Avec preuve.' },
    text: "Essayez le parcours complet : un essai de quelques minutes, puis la vérification du dossier.",
    open: "Ouvrir l'application",
    verify: 'Vérifier un dossier',
    copyright: '© 2026 NobPay · Code ouvert (licence MIT) · Prototype Dakar Bitcoin Hack #4',
    footerLabel: 'Pied de page',
    links: { app: 'Application', verify: 'Vérifier', how: 'Comment ça marche' },
  },
};

const en: LandingCopy = {
  htmlLang: 'en',
  meta: {
    title: 'NobPay · Pay on proof. Money sent home, released step by step.',
    description:
      'NobPay lets the diaspora fund projects, school fees and merchants’ restocks back home: the money stays in escrow and is released step by step, only against proof, in bitcoin over Lightning, with a record anyone can verify.',
  },
  nav: { logoLabel: 'NobPay, home', navLabel: 'Main navigation', how: 'How it works', corridors: 'Corridors', verify: 'Verify a file', open: 'Open the app', switchLabel: 'Language', switchTo: 'Français', switchHref: '/lang/fr?next=/' },
  hero: {
    title: { lead: 'Send money home.', em: 'Pay on proof.' },
    sub: 'Diaspora money stays in escrow. It is released step by step, against proof, straight to the supplier, in bitcoin over Lightning.',
    cta: 'Try the app',
    verify: 'Verify a file',
    tag: 'Prototype · Dakar Bitcoin Hack #4',
  },
  why: {
    eyebrow: 'The problem',
    title: { lead: 'A transfer moves the money.', em: 'It does not control its use.' },
    text: 'A house, a field, a shop, a child’s school year: people fund them from afar, on a relative’s word. NobPay replaces that blind trust with proof, step after step.',
    stats: [
      { value: '124.2', unit: ' $bn', text: 'sent by migrants to their families in Africa in 2025.' },
      { value: '1 $', unit: ' in 3', text: 'of remittances to low and middle income countries reaches rural areas, nearly $233 billion in 2025.' },
      { value: '22', unit: ' $bn a year', text: 'invested by recipient families in rural agriculture and food (estimate, same countries).' },
    ],
    sourcePrefix: 'Source: IFAD, 14 September 2026, reported by ',
    sourceUn: 'UN News',
    sourceAnd: ' and ',
    sourceIfad: 'IFAD',
    sourceSuffix: '. These figures describe the market, not NobPay’s results.',
  },
  how: {
    chip: 'How it works',
    title: { lead: 'Fund, prove, release,', em: 'verify.' },
    text: 'Four gestures, all in the app. These screens are the prototype’s, with demonstration data (the app itself is in French for now).',
    steps: [
      { name: 'Fund', bullets: ['You pay a Lightning invoice from any wallet.', 'The money stays in escrow, counted project by project. It is not a bank account.'], alt: 'Funding screen: a Lightning invoice and QR code' },
      { name: 'Prove', bullets: ['The trusted person on site opens a private link, no account needed.', 'Dated, geotagged photos, an invoice, a land title, and who is to be paid.'], alt: 'Field screen: photos, invoice and supplier to pay' },
      { name: 'Release', bullets: ['You see the proof and the points to check; on request an AI gives a second opinion. You decide.', 'The supplier is paid in sats at their Lightning address, and the receipt shows the proof of payment.'], alt: 'Payment confirmation screen' },
      { name: 'Verify', bullets: ['Every event joins a hash-chained record, anchored on Bitcoin and copied to Nostr relays.', 'Anyone can check it from their own browser, without us.'], alt: 'Public page to verify a file' },
    ],
  },
  corridors: {
    eyebrow: 'Three corridors, one engine',
    title: { lead: 'One engine for', em: 'what matters back home' },
    text: 'A project at home, a school year, a merchant’s stock: each has its usual steps. You adjust them, then every payment depends on a proof.',
  },
  peek: {
    eyebrow: 'For the funder',
    title: { lead: 'The whole project,', em: 'on one screen.' },
    text: 'The escrow, what is released, the current step, the proof waiting for your decision: nothing hides behind a statement.',
    ticks: ['Amounts in dollars, with the bitcoin price shown before each payment', 'One step open at a time, and only if the escrow covers it', 'A private link for the person on site: they see neither your balance nor your funds'],
    cta: 'Try the app',
    altHome: 'Dashboard: total in escrow and teams on site',
    altProject: 'Project: escrow, progress and steps',
  },
  rails: {
    eyebrow: 'Under the hood',
    title: { lead: 'Open rails,', em: 'end to end' },
    text: 'Lightning in and out, Bitcoin and Nostr to prove. Secrets stay on the server, and every answer from a wallet is checked before it is believed.',
    items: [
      { tag: 'In', title: 'Bitcoin Lightning', text: 'The funder pays an invoice from any wallet. The server credits the escrow only once the payment is confirmed.', icon: 'bolt' },
      { tag: 'Custody', title: 'Two connections, two sets of rights', text: 'One connection can only make invoices (it cannot spend); the other pays, with a budget and ceilings.', icon: 'lock' },
      { tag: 'Out', title: 'Lightning address', text: 'The supplier is paid at their address, for the exact amount, and the receipt carries the proof of payment. Mobile money is optional (Bitnob).', icon: 'mobile' },
      { tag: 'Proof', title: 'Bitcoin and Nostr', text: 'The file’s fingerprint is anchored with OpenTimestamps; every event is also published on Nostr relays.', icon: 'currency_bitcoin' },
    ],
  },
  verify: {
    eyebrow: "Verify, don't trust",
    title: { lead: 'Do not believe us.', em: 'Verify.' },
    text: 'A NobPay file can be checked with no account and without us: your browser recomputes the fingerprint, replays the whole record, and asks the Nostr relays and Bitcoin itself.',
    cta: 'Verify a file',
    ariaLabel: 'Example of a verification result',
    checks: [
      { title: 'The file is the one that was anchored', text: 'The fingerprint recomputed on your side is identical.' },
      { title: 'The record has not been altered', text: 'Every event contains the fingerprint of the previous one.' },
      { title: 'The record is replicated on Nostr', text: 'The commitments are found on relays, signed by the project’s key.' },
      { title: 'The fingerprint is in the Bitcoin blockchain', text: 'Waiting for a block, usually a few hours.', wait: true },
    ],
    example: 'Illustration only: this is not a real file.',
  },
  faq: {
    title: { lead: 'Straight', em: 'answers' },
    items: [
      {
        q: 'Where is my money during the project?',
        a: 'In the Lightning wallet of the NobPay instance, counted project by project; nothing is released without your approval. It is an escrow held by the operator of the instance: it is neither a bank account nor a licensed financial service. During the pilot, ceilings limit the amounts, and the service pauses if what it owes exceeds what its wallets hold.',
      },
      {
        q: 'Does it really work today?',
        a: 'It is an open-source prototype, built for Dakar Bitcoin Hack #4. Depending on the instance, payments are simulated (demonstration), made on Bitnob’s test API, or made with real sats under a ceiling. The mode is written at the top of every screen.',
      },
      {
        q: 'Why Bitcoin and Lightning?',
        a: 'A Lightning payment usually settles in seconds, with no bank, and its receipt holds a cryptographic proof of payment that anyone can check. The rest of the chain (record, anchoring, Nostr) rests on the same principle: verify rather than believe.',
      },
      {
        q: 'What do the Bitcoin anchor and Nostr prove?',
        a: 'That the file existed as it is at a given date and has not changed since, and that independent copies exist on relays. Only fingerprints are published, never your photos, names or amounts. It does not prove that a photo shows the right building site: that is for you to judge before paying.',
      },
      {
        q: 'What about the AI?',
        a: 'On request, an AI (Claude, by Anthropic) looks at the photos and reads the invoice, then points out what does not add up. It is sometimes wrong: its opinion is advisory, you decide. The photos and the invoice are sent to it only if you ask, and nothing else about you.',
      },
      {
        q: 'Which countries?',
        a: 'Senegal first. Lightning has no borders, but the supplier must be able to receive it: otherwise, payment by mobile money (Wave, Orange Money, Free Money) goes through Bitnob, in test for now.',
      },
      {
        q: 'Is the code open?',
        a: 'Yes, under the MIT licence. Checking a file happens in your browser and can be read line by line.',
      },
    ],
  },
  final: {
    title: { lead: 'Send money home.', em: 'Pay on proof.' },
    text: 'Try the whole path: a trial of a few minutes, then the verification of the file.',
    open: 'Open the app',
    verify: 'Verify a file',
    copyright: '© 2026 NobPay · Open source (MIT licence) · Prototype, Dakar Bitcoin Hack #4',
    footerLabel: 'Footer',
    links: { app: 'App', verify: 'Verify', how: 'How it works' },
  },
};

export const LANDING_COPY: Record<Lang, LandingCopy> = { fr, en };
