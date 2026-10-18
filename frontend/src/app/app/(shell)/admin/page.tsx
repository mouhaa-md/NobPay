import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FlowHeader } from '@/components/app/AppHeader';
import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/primitives';
import { formatDateTime, formatFcfa, formatInt, formatUsd } from '@/lib/money';
import { adminOverview, isAdmin } from '@/server/admin';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { readDb } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administration' };

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  completed: { label: 'Payé', tone: 'success' },
  paid: { label: 'Reçu', tone: 'success' },
  confirmed: { label: 'Confirmé', tone: 'success' },
  initiated: { label: 'Lancé', tone: 'warning' },
  pending: { label: 'En attente', tone: 'warning' },
  failed: { label: 'Échec', tone: 'danger' },
  expired: { label: 'Expirée', tone: 'neutral' },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

const th = 'whitespace-nowrap px-3 py-2 text-left font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant';
const td = 'px-3 py-2.5 align-top font-body-sm text-body-sm';

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
      <table className="w-full min-w-[640px] border-collapse">
        <thead className="bg-surface-container-low">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {children}
          {empty && (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">
                Rien pour l’instant.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function Admin() {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();
  const db = await readDb();
  const { mode } = getConfig();
  const o = adminOverview(db);
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

  const kpis = [
    { icon: 'group', label: 'Comptes', value: o.counts.users },
    { icon: 'folder', label: 'Projets', value: o.counts.projects },
    { icon: 'account_balance_wallet', label: 'Versements reçus', value: o.counts.fundings.paid, hint: `${sum(o.counts.fundings)} au total` },
    { icon: 'payments', label: 'Paiements terminés', value: o.counts.payouts.completed, hint: `${sum(o.counts.payouts)} au total` },
    { icon: 'anchor', label: 'Ancrages confirmés', value: o.counts.anchors.confirmed, hint: `${o.counts.anchors.pending} en attente` },
    { icon: 'webhook', label: 'Évènements Bitnob', value: o.counts.webhooks },
  ];

  return (
    <main className="min-h-screen pb-12 lg:mx-auto lg:w-full lg:max-w-[1200px] lg:px-8 lg:pt-8">
      <FlowHeader title="Administration" backHref="/app/profil" />
      <div className="flex flex-col gap-space-lg px-space-md pt-space-md lg:px-0 lg:pt-0">
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="neutral" icon="visibility">
            Lecture seule
          </Chip>
          <Chip tone={mode === 'mock' ? 'warning' : 'success'} icon={mode === 'mock' ? 'science' : 'verified_user'}>
            {mode === 'mock' ? 'Démonstration' : 'Sandbox Bitnob'}
          </Chip>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Cette page montre ce qui est bloqué. Elle ne déplace jamais d’argent.</p>
        </div>

        <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm ring-1 ring-outline-variant/30">
              <Icon name={k.icon} size={20} className="text-primary" />
              <p className="mt-2 font-headline-lg-mobile text-headline-lg-mobile font-bold leading-none">{formatInt(k.value)}</p>
              <p className="mt-1 font-label-md text-label-md text-on-surface-variant">{k.label}</p>
              {k.hint && <p className="font-label-sm text-label-sm text-on-surface-variant/80">{k.hint}</p>}
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 font-title-md text-title-md">
            <Icon name="notification_important" size={20} className={o.alerts.length ? 'text-[#B45309]' : 'text-[#16A34A]'} />À surveiller
          </h2>
          {o.alerts.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl bg-[#DCFCE7] p-3.5 font-body-sm text-body-sm text-[#14532D]">
              <Icon name="check_circle" size={18} filled /> Rien ne bloque : aucun paiement coincé, aucune conversion abandonnée, aucun ancrage en retard.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {o.alerts.map((a, i) => (
                <li key={i} className={`flex items-start gap-3 rounded-2xl p-3.5 font-body-sm text-body-sm ${a.level === 'error' ? 'bg-error-container text-on-error-container' : 'bg-[#FEF3C7] text-[#78350F]'}`}>
                  <Icon name={a.level === 'error' ? 'error' : 'warning'} size={18} className="mt-px shrink-0" />
                  <span className="min-w-0 flex-1">{a.text}</span>
                  {a.href && (
                    <Link href={a.href} className="shrink-0 font-semibold underline">
                      Ouvrir
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-title-md text-title-md">Paiements fournisseurs</h2>
          <Table head={['Date', 'Projet / étape', 'Fournisseur', 'Montant', 'État', 'Référence']} empty={o.payouts.length === 0}>
            {o.payouts.map((p) => (
              <tr key={p.reference}>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(p.at)}</td>
                <td className={td}>
                  <Link href={`/app/projets/${p.projectId}/etapes/${p.stepId}`} className="font-medium text-primary hover:underline">
                    {p.stepTitle}
                  </Link>
                  <span className="block text-on-surface-variant">{p.project}</span>
                </td>
                <td className={td}>
                  {p.supplier}
                  <span className="block text-on-surface-variant">{p.phone}</span>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {formatFcfa(p.amountFcfa)}
                  <span className="block text-on-surface-variant">{formatUsd(p.amountUsdCents)}</span>
                </td>
                <td className={td}>
                  <StatusChip status={p.status} />
                  {p.mode === 'mock' && <span className="mt-1 block text-on-surface-variant">simulé</span>}
                  {p.error && <span className="mt-1 block text-error">{p.error}</span>}
                </td>
                <td className={`${td} break-all font-mono text-[11px]`}>{p.reference}</td>
              </tr>
            ))}
          </Table>
        </section>

        <section>
          <h2 className="mb-2 font-title-md text-title-md">Versements des financeurs</h2>
          <Table head={['Date', 'Projet', 'Montant', 'Moyen', 'État', 'Conversion']} empty={o.fundings.length === 0}>
            {o.fundings.map((f, i) => (
              <tr key={`${f.projectId}-${i}`}>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(f.at)}</td>
                <td className={td}>
                  <Link href={`/app/projets/${f.projectId}`} className="font-medium text-primary hover:underline">
                    {f.project}
                  </Link>
                </td>
                <td className={`${td} whitespace-nowrap`}>{formatUsd(f.amountCents)}</td>
                <td className={td}>
                  {f.method}
                  {f.simulated && <span className="block text-on-surface-variant">simulé</span>}
                </td>
                <td className={td}>
                  <StatusChip status={f.status} />
                  {f.note && <span className="mt-1 block text-on-surface-variant">{f.note}</span>}
                </td>
                <td className={td}>{f.conversion ? <StatusChip status={f.conversion === 'done' ? 'completed' : f.conversion} /> : <span className="text-on-surface-variant">—</span>}</td>
              </tr>
            ))}
          </Table>
        </section>

        <section>
          <h2 className="mb-2 font-title-md text-title-md">Ancrages Bitcoin</h2>
          <Table head={['Date', 'Projet', 'Jusqu’à l’évènement', 'État', 'Bloc']} empty={o.anchors.length === 0}>
            {o.anchors.map((a) => (
              <tr key={a.id}>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(a.at)}</td>
                <td className={td}>
                  <Link href={`/verifier/${a.id}`} className="font-medium text-primary hover:underline">
                    {a.project}
                  </Link>
                </td>
                <td className={td}>n° {a.upToSeq}</td>
                <td className={td}>
                  <StatusChip status={a.status} />
                </td>
                <td className={td}>{a.bitcoinBlock ? formatInt(a.bitcoinBlock) : '—'}</td>
              </tr>
            ))}
          </Table>
        </section>

        <section>
          <h2 className="mb-2 font-title-md text-title-md">Journal des évènements Bitnob (25 derniers)</h2>
          <Table head={['Date', 'Évènement', 'Résultat']} empty={o.webhooks.length === 0}>
            {o.webhooks.map((w, i) => (
              <tr key={`${w.at}-${i}`}>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(w.at)}</td>
                <td className={td}>{w.type}</td>
                <td className={td}>
                  {w.outcome}
                  {w.note && <span className="block text-on-surface-variant">{w.note}</span>}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      </div>
    </main>
  );
}
