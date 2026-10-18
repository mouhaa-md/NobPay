import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { FieldProofForm } from '@/components/app/FieldProofForm';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { Chip } from '@/components/ui/primitives';
import { formatDateTime, formatUsdShort } from '@/lib/money';
import { PROOF_LABEL, SECTORS } from '@/lib/templates';
import { readDb } from '@/server/db';
import { reconcile } from '@/server/services';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Espace terrain', robots: { index: false, follow: false } };

export default async function FieldPage({ params }: { params: { token: string } }) {
  await reconcile();
  const db = await readDb();
  const project = db.projects.find((p) => p.managerToken === params.token);
  if (!project) notFound();
  const owner = db.users.find((u) => u.id === project.ownerId);
  const sector = SECTORS[project.sector];

  const todo = project.steps.find((s) => s.status === 'active' || s.status === 'rejected');
  const waiting = project.steps.find((s) => s.status === 'proof_submitted' || s.status === 'releasing');
  const allDone = project.steps.every((s) => s.status === 'paid');
  const next = project.steps.find((s) => s.status === 'upcoming');

  return (
    <main className="min-h-screen pb-16">
      <AutoRefresh active={!!waiting} everyMs={4000} />
      <header className="pt-safe bg-gradient-to-br from-[#0A0F24] via-[#0B132B] to-[#1E40AF] px-space-md pb-6 pt-5 text-white">
        <div className="mb-4 flex items-center justify-between">
          <Logo tone="light" className="text-[18px]" />
          <Chip tone="dark" icon="badge">
            Espace terrain
          </Chip>
        </div>
        <p className="font-label-md text-label-md text-surface-variant">Bonjour {project.managerName.split(' ')[0]}</p>
        <h1 className="mt-0.5 font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">{project.name}</h1>
        <p className="mt-1 flex items-center gap-2 font-body-sm text-body-sm text-surface-variant">
          <Flag code="SN" className="h-3 w-[18px]" /> {project.city} · <Icon name={sector.icon} size={16} /> {sector.label}
          {owner ? ` · projet de ${owner.firstName}` : ''}
        </p>
      </header>

      <div className="flex flex-col gap-space-lg px-space-md pt-space-md">
        {todo && (
          <section className="flex flex-col gap-3">
            <div className="rounded-2xl bg-primary/5 p-4 ring-1 ring-primary-container/30">
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-primary">
                Étape {todo.index} sur {project.steps.length} · {formatUsdShort(todo.amountCents)}
              </p>
              <h2 className="mt-0.5 font-title-lg text-title-lg">{todo.title}</h2>
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">À envoyer : {todo.proofKinds.map((k) => PROOF_LABEL[k]).join(' + ')}</p>
              {todo.status === 'rejected' && (
                <p className="mt-2 flex items-start gap-2 rounded-xl bg-error-container px-3 py-2 font-body-sm text-body-sm text-on-error-container" role="alert">
                  <Icon name="undo" size={18} className="mt-px shrink-0" />
                  <span>
                    <strong>Preuve refusée.</strong> {todo.decision?.note ? `« ${todo.decision.note} ». ` : ''}Merci d&apos;en renvoyer une nouvelle.
                  </span>
                </p>
              )}
            </div>
            <FieldProofForm token={project.managerToken} projectId={project.id} step={{ id: todo.id, index: todo.index, title: todo.title, proofKinds: todo.proofKinds }} previous={todo.proof?.supplier} />
          </section>
        )}

        {!todo && waiting && (
          <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface-container-low p-space-lg text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEF3C7] text-[#B45309]">
              <Icon name={waiting.status === 'releasing' ? 'sync' : 'hourglass_top'} size={28} />
            </span>
            <p className="font-title-lg text-title-lg">{waiting.status === 'releasing' ? 'Paiement en cours' : 'Preuve reçue'}</p>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {waiting.status === 'releasing'
                ? `${waiting.payout?.supplier.name ?? 'Le fournisseur'} va recevoir son paiement sur son mobile money.`
                : `${owner?.firstName ?? 'Le financeur'} regarde votre envoi${waiting.proof ? ` du ${formatDateTime(waiting.proof.submittedAt)}` : ''}. Cette page se met à jour toute seule.`}
            </p>
          </section>
        )}

        {!todo && !waiting && !allDone && (
          <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface-container-low p-space-lg text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
              <Icon name="lock" size={28} />
            </span>
            <p className="font-title-lg text-title-lg">Prochaine étape pas encore ouverte</p>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {next ? `« ${next.title} » s’ouvrira dès que ${owner?.firstName ?? 'le financeur'} aura alimenté le séquestre.` : 'Patientez.'}
            </p>
          </section>
        )}

        {allDone && (
          <section className="nob-pop flex flex-col items-center gap-3 rounded-3xl bg-[#DCFCE7] p-space-lg text-center text-[#14532D]">
            <Icon name="celebration" size={40} filled />
            <p className="font-title-lg text-title-lg">Projet terminé</p>
            <p className="font-body-md text-body-md">Toutes les étapes sont payées. Merci pour votre travail.</p>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-title-md text-title-md">Les étapes</h2>
          <ol className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
            {project.steps.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3.5 py-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.status === 'paid' ? 'bg-[#16A34A] text-white' : s === todo ? 'bg-primary-container text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  {s.status === 'paid' ? <Icon name="check" size={18} /> : <span className="font-label-md text-label-md font-bold">{s.index}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-label-lg text-label-lg">{s.title}</span>
                  <span className="block font-label-sm text-label-sm text-on-surface-variant">
                    {s.status === 'paid' ? 'Payée' : s.status === 'releasing' ? 'Paiement en cours' : s.status === 'proof_submitted' ? 'Preuve en cours de validation' : s.status === 'rejected' ? 'À refaire' : s.status === 'active' ? 'À envoyer maintenant' : 'À venir'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <p className="flex items-start gap-2 rounded-2xl bg-surface-container-low p-3.5 font-label-sm text-label-sm text-on-surface-variant">
          <Icon name="lock" size={16} className="mt-px shrink-0" />
          Ce lien est personnel : ne le partagez pas. Vous ne voyez pas le solde du financeur et vous ne pouvez pas débloquer d&apos;argent.
        </p>
      </div>
    </main>
  );
}
