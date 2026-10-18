import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db, Funding, Payout, Project, Step, StoredFile, Supplier, User } from '@/lib/types';
import { appendLedger } from './ledger';
import { mockPaymentHash, mockPreimage } from './bitnob/mock';
import { sha256Hex } from './crypto';

/**
 * Demonstration data. Every figure shown in the app comes from this one dataset
 * (see design-reference/COPY-RULES.md). It is flagged `demo: true` and clearly
 * labelled as such in the UI.
 */

const DAY = 86_400_000;

function publicFileHash(rel: string): { sha256: string; size: number } {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', rel));
    return { sha256: sha256Hex(buf), size: buf.length };
  } catch {
    return { sha256: sha256Hex(rel), size: 0 };
  }
}

function seedFile(id: string, name: string, rel: string, mime: string): StoredFile {
  const { sha256, size } = publicFileHash(rel);
  return { id, name, mime, size, sha256, publicPath: rel };
}

export const DEMO_USER_ID = 'u_aminata';

export function buildSeed(nowMs: number = Date.now()): Db {
  const at = (daysAgo: number, hour: number, minute = 0): string => {
    const d = new Date(nowMs - daysAgo * DAY);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const db: Db = { version: 1, users: [], projects: [], fundings: [], ledger: [], anchors: [], webhooks: [] };

  const user: User = {
    id: DEMO_USER_ID,
    firstName: 'Aminata',
    lastName: 'Sow',
    country: 'FR',
    phone: '+33612345678',
    createdAt: at(40, 9),
    demo: true,
  };
  db.users.push(user);

  const makeSteps = (
    projectId: string,
    defs: { title: string; amountCents: number; proofKinds: Step['proofKinds'] }[],
  ): Step[] =>
    defs.map((d, i) => ({
      id: `${projectId}_s${i + 1}`,
      index: i + 1,
      title: d.title,
      amountCents: d.amountCents,
      proofKinds: d.proofKinds,
      status: 'upcoming' as const,
    }));

  const addFunding = (
    project: Project,
    n: number,
    amountCents: number,
    method: Funding['method'],
    daysAgo: number,
    hour: number,
    minute: number,
  ) => {
    const reference = `nobpay:fund:${project.id}:${n}`;
    const paidAt = at(daysAgo, hour, minute);
    const funding: Funding = {
      id: `f_${project.id}_${n}`,
      projectId: project.id,
      amountCents,
      method,
      status: 'paid',
      reference,
      mode: 'mock',
      createdAt: paidAt,
      paidAt,
      demo: true,
    };
    if (method === 'lightning') {
      const btcUsd = 81_500;
      funding.amountSats = Math.round((amountCents / 100 / btcUsd) * 1e8);
      funding.btcUsd = btcUsd;
      funding.paymentHash = mockPaymentHash(reference);
      funding.preimage = mockPreimage(reference);
      funding.bolt11 = 'lndemo1…';
      funding.invoiceId = `seed_inv_${project.id}_${n}`;
      funding.conversion = { status: 'done', detail: 'Données de démonstration' };
    }
    db.fundings.push(funding);
    appendLedger(
      db,
      project.id,
      'funding_paid',
      {
        fundingId: funding.id,
        method,
        amountCents,
        amountSats: funding.amountSats,
        paymentHash: funding.paymentHash,
        preimage: funding.preimage,
      },
      paidAt,
    );
  };

  const payStep = (
    project: Project,
    step: Step,
    supplier: Supplier,
    daysAgo: number,
    hour: number,
    minute: number,
    proofPhotoRel?: string,
  ) => {
    const rate = 760;
    const submittedAt = at(daysAgo + 1, hour, minute);
    const approvedAt = at(daysAgo, hour, minute);
    const proof: NonNullable<Step['proof']> = {
      photos: proofPhotoRel
        ? [
            {
              ...seedFile(
                `seed-${step.id}-1`,
                proofPhotoRel.endsWith('.svg') ? 'titre-foncier.svg' : 'photo-chantier.jpg',
                proofPhotoRel,
                proofPhotoRel.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg',
              ),
              takenAt: submittedAt,
              gps: { lat: 14.7889, lng: -16.9255, accuracy: 12 },
            },
          ]
        : [],
      invoice: seedFile(`seed-facture-${step.id}`, 'facture.svg', 'demo/facture.svg', 'image/svg+xml'),
      invoiceAmountFcfa: Math.round((step.amountCents / 100) * rate),
      supplier,
      submittedAt,
      submittedBy: 'manager',
    };
    const payout: Payout = {
      reference: `nobpay:pay:${step.id}`,
      quoteId: `seed_quote_${step.id}`,
      payoutId: `seed_po_${step.id}`,
      status: 'completed',
      amountUsdCents: step.amountCents,
      amountFcfa: Math.round((step.amountCents / 100) * rate),
      rate,
      feeUsdCents: 0,
      supplier,
      mode: 'mock',
      startedAt: approvedAt,
      completedAt: new Date(new Date(approvedAt).getTime() + 90_000).toISOString(),
    };
    step.proof = proof;
    step.decision = { kind: 'approved', at: approvedAt };
    step.payout = payout;
    step.status = 'paid';
    appendLedger(
      db,
      project.id,
      'proof_submitted',
      {
        stepId: step.id,
        index: step.index,
        photos: proof.photos.map((p) => ({ sha256: p.sha256, takenAt: p.takenAt, gps: p.gps })),
        invoice: { sha256: proof.invoice!.sha256, amountFcfa: proof.invoiceAmountFcfa },
      },
      submittedAt,
    );
    appendLedger(db, project.id, 'step_approved', { stepId: step.id, index: step.index, amountCents: step.amountCents }, approvedAt);
    appendLedger(
      db,
      project.id,
      'payout_started',
      {
        stepId: step.id,
        index: step.index,
        reference: payout.reference,
        quoteId: payout.quoteId,
        amountUsdCents: payout.amountUsdCents,
        amountFcfa: payout.amountFcfa,
        rate,
        supplier: { name: supplier.name, network: supplier.network },
      },
      approvedAt,
    );
    appendLedger(
      db,
      project.id,
      'payout_completed',
      { stepId: step.id, index: step.index, reference: payout.reference, payoutId: payout.payoutId },
      payout.completedAt!,
    );
  };

  const createProject = (p: Omit<Project, 'steps' | 'createdAt' | 'approvalRule' | 'demo'> & { createdDaysAgo: number }, steps: Step[]) => {
    const { createdDaysAgo, ...rest } = p;
    const project: Project = { ...rest, steps, createdAt: at(createdDaysAgo, 9, 30), approvalRule: 'owner', demo: true };
    db.projects.push(project);
    appendLedger(
      db,
      project.id,
      'project_created',
      {
        name: project.name,
        sector: project.sector,
        city: project.city,
        budgetCents: project.budgetCents,
        steps: steps.map((s) => ({ index: s.index, title: s.title, amountCents: s.amountCents })),
      },
      project.createdAt,
    );
    return project;
  };

  const geometre: Supplier = { name: 'Cabinet Fall, géomètre', network: 'orange_money', phone: '+221771234567' };
  const ndiaye: Supplier = { name: 'Quincaillerie Ndiaye', network: 'wave', phone: '+221776543210' };

  // ---- 1. Villa à Thiès (Immobilier) ---------------------------------------
  const villaId = 'p_villa';
  const villa = createProject(
    {
      id: villaId,
      ownerId: DEMO_USER_ID,
      name: 'Villa à Thiès',
      sector: 'immobilier',
      city: 'Thiès',
      country: 'SN',
      budgetCents: 2_400_000,
      coverImage: '/covers/villa-thies.jpg',
      managerName: 'Mamadou Diop',
      managerPhone: '+221770001122',
      managerToken: 'demo-villa-thies',
      createdDaysAgo: 14,
    },
    makeSteps(villaId, [
      { title: 'Vérification du titre foncier', amountCents: 120_000, proofKinds: ['titre'] },
      { title: 'Fondations', amountCents: 480_000, proofKinds: ['photos', 'facture'] },
      { title: 'Élévation des murs', amountCents: 600_000, proofKinds: ['photos', 'facture'] },
      { title: 'Dalle', amountCents: 480_000, proofKinds: ['photos', 'facture'] },
      { title: 'Toiture', amountCents: 420_000, proofKinds: ['photos', 'facture'] },
      { title: 'Finitions', amountCents: 300_000, proofKinds: ['photos', 'facture'] },
    ]),
  );
  // Chronological order matters: the ledger is a hash chain read from top to bottom.
  addFunding(villa, 1, 1_500_000, 'lightning', 12, 15, 10);
  payStep(villa, villa.steps[0], geometre, 10, 10, 15, 'demo/titre-foncier.svg');
  addFunding(villa, 2, 400_000, 'lightning', 6, 11, 40);
  payStep(villa, villa.steps[1], ndiaye, 4, 14, 20, 'covers/villa-thies.jpg');
  addFunding(villa, 3, 500_000, 'lightning', 1, 18, 30);
  // Step 3: proof submitted yesterday, waiting for the funder's decision.
  const s3 = villa.steps[2];
  s3.status = 'proof_submitted';
  s3.proof = {
    photos: [
      {
        ...seedFile('seed-villa-s3-1', 'murs-facade.jpg', 'covers/villa-thies.jpg', 'image/jpeg'),
        takenAt: at(1, 19, 5),
        gps: { lat: 14.7886, lng: -16.9262, accuracy: 9 },
      },
    ],
    invoice: seedFile('seed-facture-villa-s3', 'facture-ciment.svg', 'demo/facture.svg', 'image/svg+xml'),
    invoiceAmountFcfa: 4_560_000,
    note: 'Murs du rez-de-chaussée terminés, parpaings livrés par la quincaillerie.',
    supplier: ndiaye,
    submittedAt: at(1, 19, 15),
    submittedBy: 'manager',
  };
  appendLedger(
    db,
    villa.id,
    'proof_submitted',
    {
      stepId: s3.id,
      index: s3.index,
      photos: s3.proof.photos.map((p) => ({ sha256: p.sha256, takenAt: p.takenAt, gps: p.gps })),
      invoice: { sha256: s3.proof.invoice!.sha256, amountFcfa: s3.proof.invoiceAmountFcfa },
      note: s3.proof.note,
    },
    s3.proof.submittedAt,
  );

  // ---- 2. Champ de mil à Kaolack (Agricole) --------------------------------
  const champId = 'p_champ';
  const champ = createProject(
    {
      id: champId,
      ownerId: DEMO_USER_ID,
      name: 'Champ de mil à Kaolack',
      sector: 'agricole',
      city: 'Kaolack',
      country: 'SN',
      budgetCents: 900_000,
      coverImage: '/covers/champ-kaolack.jpg',
      managerName: 'Ousmane Ba',
      managerPhone: '+221770003344',
      managerToken: 'demo-champ-kaolack',
      createdDaysAgo: 40,
    },
    makeSteps(champId, [
      { title: 'Préparation du sol', amountCents: 135_000, proofKinds: ['photos', 'facture'] },
      { title: 'Semis', amountCents: 135_000, proofKinds: ['photos', 'facture'] },
      { title: 'Intrants et entretien', amountCents: 270_000, proofKinds: ['photos', 'facture'] },
      { title: 'Récolte et stockage', amountCents: 180_000, proofKinds: ['photos', 'facture'] },
      { title: 'Vente de la récolte', amountCents: 180_000, proofKinds: ['facture'] },
    ]),
  );
  const intrants: Supplier = { name: 'Coopérative Sine-Saloum', network: 'wave', phone: '+221779998877' };
  addFunding(champ, 1, 400_000, 'lightning', 38, 10, 5);
  payStep(champ, champ.steps[0], intrants, 33, 9, 30, 'covers/champ-kaolack.jpg');
  addFunding(champ, 2, 500_000, 'lightning', 30, 16, 45);
  payStep(champ, champ.steps[1], intrants, 24, 11, 0, 'covers/champ-kaolack.jpg');
  payStep(champ, champ.steps[2], intrants, 11, 15, 20, 'covers/champ-kaolack.jpg');
  champ.steps[3].status = 'active';

  // ---- 3. Boutique à Sandaga (Commerce) ------------------------------------
  const boutiqueId = 'p_boutique';
  const boutique = createProject(
    {
      id: boutiqueId,
      ownerId: DEMO_USER_ID,
      name: 'Boutique à Sandaga',
      sector: 'commerce',
      city: 'Dakar',
      country: 'SN',
      budgetCents: 500_000,
      coverImage: '/covers/boutique-sandaga.jpg',
      managerName: 'Aïcha Fall',
      managerPhone: '+221770005566',
      managerToken: 'demo-boutique-sandaga',
      createdDaysAgo: 10,
    },
    makeSteps(boutiqueId, [
      { title: 'Achat du stock initial', amountCents: 100_000, proofKinds: ['facture'] },
      { title: 'Livraison du stock', amountCents: 200_000, proofKinds: ['photos', 'facture'] },
      { title: 'Mise en rayon', amountCents: 50_000, proofKinds: ['photos'] },
      { title: 'Réapprovisionnement', amountCents: 150_000, proofKinds: ['facture'] },
    ]),
  );
  const grossiste: Supplier = { name: 'Grossiste Touba Textiles', network: 'orange_money', phone: '+221778889900' };
  addFunding(boutique, 1, 500_000, 'lightning', 9, 17, 0);
  payStep(boutique, boutique.steps[0], grossiste, 6, 10, 45);
  boutique.steps[1].status = 'active';

  return db;
}
