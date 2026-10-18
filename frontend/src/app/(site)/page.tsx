import type { Metadata } from 'next';
import Link from 'next/link';
import { Coin, PALETTES, SymbolBitcoin, SymbolDollar } from '@/components/site/Coin';
import { HeroArt } from '@/components/site/HeroArt';
import { MotionProvider } from '@/components/site/MotionProvider';
import { Phone } from '@/components/site/Phone';
import { Icon } from '@/components/ui/Icon';
import { SECTORS, STEP_TEMPLATES } from '@/lib/templates';
import type { Sector } from '@/lib/types';

export const metadata: Metadata = {
  title: { absolute: 'NobPay · Investissez au pays. Avec preuve.' },
  description:
    "NobPay aide la diaspora à financer des projets immobiliers, agricoles et commerciaux au pays : l'argent reste en séquestre et n'est libéré qu'étape par étape, sur preuve, avec une trace ancrée sur Bitcoin.",
};

const SECTOR_ORDER: Sector[] = ['immobilier', 'agricole', 'commerce'];
const SECTOR_NOTE: Record<Sector, string> = {
  immobilier: 'Titre foncier vérifié avant le premier paiement, puis chaque phase du chantier sur photos datées.',
  agricole: 'Intrants, semis, récolte : chaque achat est prouvé par une facture et une photo du terrain.',
  commerce: 'Du premier achat de stock à la mise en rayon : le fournisseur est payé quand la marchandise arrive.',
};

const FAQ = [
  {
    q: 'Où est mon argent pendant le projet ?',
    a: "Dans un portefeuille Bitnob lié à votre projet. NobPay est la couche de règles : rien n'en sort sans votre validation. Ce n'est pas un compte bancaire.",
  },
  {
    q: "Est-ce que cela fonctionne vraiment aujourd'hui ?",
    a: "C'est un prototype réalisé pendant le hackathon Code & Chain Dakar. En mode démonstration, Lightning et mobile money sont simulés ; le mode sandbox se branche sur l'API de test de Bitnob. Aucun argent réel n'est géré pour l'instant.",
  },
  {
    q: "Que prouve l'ancrage sur Bitcoin ?",
    a: "Que le dossier existait tel quel à une date donnée et n'a pas changé depuis. Seule son empreinte (64 caractères) est publiée, jamais vos photos ni vos montants. Il ne prouve pas qu'une photo montre le bon chantier : c'est à vous de le juger avant de payer.",
  },
  {
    q: 'Dans quels pays ?',
    a: 'Le prototype paie au Sénégal, par Wave, Orange Money ou Free Money. Les autres pays dépendront des réseaux que Bitnob permet de payer.',
  },
  {
    q: 'Le code est-il ouvert ?',
    a: "Oui, sous licence MIT. La vérification d'un dossier se fait dans votre navigateur et peut être relue ligne par ligne.",
  },
];

const RAILS = [
  { tag: 'Entrée', title: 'Bitcoin Lightning', text: 'Le financeur paie une facture depuis n’importe quel portefeuille.', icon: 'bolt' },
  { tag: 'Garde', title: 'Séquestre Bitnob', text: 'Les fonds restent dans un portefeuille lié au projet.', icon: 'lock' },
  { tag: 'Sortie', title: 'Mobile money', text: 'Wave, Orange Money ou Free Money : le fournisseur est payé directement.', icon: 'smartphone' },
  { tag: 'Preuve', title: 'Ancrage Bitcoin', text: 'L’empreinte du dossier est publiée avec OpenTimestamps.', icon: 'currency_bitcoin' },
];

export default function Landing() {
  return (
    <div className="site">
      <MotionProvider />

      {/* ============ HERO ============ */}
      <section className="hero nm-grain" data-nm-parallax-root>
        <header className="site-header">
          <Link href="/" className="site-logo" aria-label="NobPay, accueil">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
            </svg>
            <span>
              Nob<b>Pay</b>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Navigation principale">
            <a href="#how" className="hide-sm">
              Comment ça marche
            </a>
            <a href="#secteurs" className="hide-sm">
              Secteurs
            </a>
            <Link href="/verifier" className="hide-sm">
              Vérifier un dossier
            </Link>
            <Link href="/app" className="pill nm-btn">
              Ouvrir l&apos;app
            </Link>
          </nav>
        </header>

        <HeroArt />

        <div className="hero-text">
          <h1 data-nm-reveal="words">
            Investissez au pays.
            <br />
            Avec preuve.
          </h1>
          <p className="hero-sub" data-nm-reveal="lines">
            L&apos;argent de la diaspora reste en séquestre. Il n&apos;est libéré qu&apos;étape par étape, sur preuve, directement au fournisseur.
          </p>
          <div className="cta-row">
            <Link href="/app" className="btn nm-btn">
              Essayer la démo <Icon name="arrow_forward" size={22} />
            </Link>
            <Link href="/verifier" className="btn btn--ghost nm-btn">
              Vérifier un dossier
            </Link>
          </div>
          <span className="tag">
            <Icon name="science" size={16} /> Prototype · hackathon Code &amp; Chain Dakar
          </span>
        </div>
      </section>

      <main>
        {/* ============ WHY ============ */}
        <section className="wrap why" aria-labelledby="constat">
          <div className="why-grid">
            <div className="why-copy">
              <div className="eyebrow">Le constat</div>
              <h2 id="constat" data-nm-reveal="words">
                Un transfert déplace l&apos;argent. Il n&apos;en contrôle pas l&apos;usage.
              </h2>
              <p data-nm-reveal="lines" data-nm-margin="10">
                Une maison, un champ, une boutique : on finance à distance, sur la parole d&apos;un proche. NobPay remplace cette confiance aveugle par des preuves, étape après étape.
              </p>
            </div>
            <div>
              <dl className="stats">
                <div className="stat">
                  <dt>
                    <strong>
                      124,2<small> Md$</small>
                    </strong>
                  </dt>
                  <dd>envoyés par des migrants à leurs familles en Afrique en 2025.</dd>
                </div>
                <div className="stat">
                  <dt>
                    <strong>
                      1 $<small> sur 3</small>
                    </strong>
                  </dt>
                  <dd>des envois vers les pays à revenu faible ou intermédiaire arrive en zone rurale, près de 233 Md$ en 2025.</dd>
                </div>
                <div className="stat">
                  <dt>
                    <strong>
                      22<small> Md$ par an</small>
                    </strong>
                  </dt>
                  <dd>investis par les familles bénéficiaires dans l&apos;agriculture et l&apos;alimentation rurales (estimation, mêmes pays).</dd>
                </div>
              </dl>
              <p className="sources">
                Source : IFAD, 14 septembre 2026, relayé par{' '}
                <a href="https://news.un.org/en/story/2026/09/1168330" target="_blank" rel="noopener noreferrer">
                  ONU Info
                </a>{' '}
                et{' '}
                <a href="https://www.ifad.org/en/w/news/remittances-nearly-doubled-in-a-decade-to-reach-us-729-billion-in-2025-new-ifad-report-finds" target="_blank" rel="noopener noreferrer">
                  l&apos;IFAD
                </a>
                . Ces chiffres décrivent le marché, pas les résultats de NobPay.
              </p>
            </div>
          </div>
        </section>

        {/* ============ HOW (blue, real screens) ============ */}
        <section className="how nm-grain" id="how">
          <div className="wrap">
            <div className="how-head">
              <div className="chip chip--dark">
                Comment ça marche <i>⚡</i>
              </div>
              <h2 data-nm-reveal="words">Financez, prouvez, libérez, vérifiez.</h2>
              <p data-nm-reveal="lines" data-nm-margin="10">
                Quatre gestes, tous dans l&apos;application. Ces écrans sont ceux du prototype, avec des données de démonstration.
              </p>
            </div>

            <div className="tabs" data-nm-tabs data-nm-delay="5000" role="tablist">
              <div className="tab-list">
                <div className="tab" data-nm-tab role="tab">
                  <div className="nm-tab-title">
                    <span>01</span> Financer
                  </div>
                  <ul className="nm-tab-list">
                    <li>Un paiement Lightning depuis n&apos;importe quel portefeuille.</li>
                    <li>Les fonds restent en séquestre, dans un portefeuille Bitnob lié au projet.</li>
                  </ul>
                  <span className="nm-tab-progress">
                    <i />
                  </span>
                </div>
                <div className="tab" data-nm-tab role="tab">
                  <div className="nm-tab-title">
                    <span>02</span> Prouver
                  </div>
                  <ul className="nm-tab-list">
                    <li>La personne de confiance sur place ouvre un lien privé, sans compte.</li>
                    <li>Photos datées et localisées, facture, titre foncier, et qui doit être payé.</li>
                  </ul>
                  <span className="nm-tab-progress">
                    <i />
                  </span>
                </div>
                <div className="tab" data-nm-tab role="tab">
                  <div className="nm-tab-title">
                    <span>03</span> Libérer
                  </div>
                  <ul className="nm-tab-list">
                    <li>Vous regardez la preuve, puis vous validez.</li>
                    <li>Le devis affiche le taux, les frais et ce que reçoit le fournisseur, avant confirmation.</li>
                  </ul>
                  <span className="nm-tab-progress">
                    <i />
                  </span>
                </div>
                <div className="tab" data-nm-tab role="tab">
                  <div className="nm-tab-title">
                    <span>04</span> Vérifier
                  </div>
                  <ul className="nm-tab-list">
                    <li>Chaque événement s&apos;ajoute à un registre enchaîné.</li>
                    <li>Son empreinte est ancrée sur Bitcoin : n&apos;importe qui peut la contrôler.</li>
                  </ul>
                  <span className="nm-tab-progress">
                    <i />
                  </span>
                </div>
              </div>

              <div className="panels" data-nm-panels>
                <div className="nm-panel" data-nm-panel>
                  <Phone src="/site/phone-financer.webp" alt="Écran de financement : facture Lightning et code QR" />
                </div>
                <div className="nm-panel" data-nm-panel>
                  <Phone src="/site/phone-preuve.webp" alt="Écran terrain : photos, facture et fournisseur à payer" />
                </div>
                <div className="nm-panel" data-nm-panel>
                  <Phone src="/site/phone-liberer.webp" alt="Écran de confirmation du paiement avec taux et frais" />
                </div>
                <div className="nm-panel" data-nm-panel>
                  <Phone src="/site/phone-verifier.webp" alt="Page publique de vérification d'un dossier" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ SECTORS ============ */}
        <section className="wrap sectors" id="secteurs">
          <div className="section-head">
            <div className="eyebrow">Trois secteurs</div>
            <h2 data-nm-reveal="words">Un même moteur pour vos projets au pays</h2>
            <p data-nm-reveal="lines" data-nm-margin="10">
              Chaque secteur a ses étapes types. Vous les ajustez, puis chaque paiement dépend d&apos;une preuve.
            </p>
          </div>
          <div className="sector-grid">
            {SECTOR_ORDER.map((id) => {
              const s = SECTORS[id];
              return (
                <article key={id} className="sector">
                  <div className="sector-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.cover} alt="" loading="lazy" />
                    <span className="sector-tag">
                      <Icon name={s.icon} size={18} /> {s.label}
                    </span>
                  </div>
                  <div className="sector-body">
                    <h3>{s.tagline}</h3>
                    <p>{SECTOR_NOTE[id]}</p>
                    <ol>
                      {STEP_TEMPLATES[id].map((t) => (
                        <li key={t.title}>{t.title}</li>
                      ))}
                    </ol>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ============ DASHBOARD ============ */}
        <section className="peek">
          <div className="wrap peek-grid">
            <div className="peek-copy">
              <div className="eyebrow">Côté financeur</div>
              <h2 data-nm-reveal="words">Tout le projet, sur un écran.</h2>
              <p data-nm-reveal="lines" data-nm-margin="10">
                Le séquestre, ce qui est libéré, l&apos;étape en cours, la preuve qui attend votre décision : rien n&apos;est caché derrière un relevé.
              </p>
              <ul className="ticks">
                <li>
                  <Icon name="check_circle" filled size={22} /> Montants en dollars et en FCFA, au taux affiché avant chaque paiement
                </li>
                <li>
                  <Icon name="check_circle" filled size={22} /> Une seule étape ouverte à la fois, et seulement si le séquestre la couvre
                </li>
                <li>
                  <Icon name="check_circle" filled size={22} /> Lien privé pour la personne sur place : elle ne voit ni votre solde ni vos fonds
                </li>
              </ul>
              <Link href="/app" className="btn nm-btn">
                Essayer la démo <Icon name="arrow_forward" size={22} />
              </Link>
            </div>
            <div className="peek-phones" aria-hidden="false">
              <div className="peek-a" data-nm-float="b">
                <Phone src="/site/phone-accueil.webp" alt="Tableau de bord : total en séquestre et équipes sur place" />
              </div>
              <div className="peek-b" data-nm-float="a">
                <Phone src="/site/phone-projet.webp" alt="Projet : séquestre, avancement et étapes" />
              </div>
            </div>
          </div>
        </section>

        {/* ============ RAILS ============ */}
        <section className="wrap rails" id="rails">
          <div className="section-head">
            <div className="eyebrow">Sous le capot</div>
            <h2 data-nm-reveal="words">Des rails ouverts, de bout en bout</h2>
            <p data-nm-reveal="lines" data-nm-margin="10">
              Lightning pour entrer, Bitnob pour garder et payer, Bitcoin pour prouver. Les secrets restent côté serveur, les états viennent de webhooks signés.
            </p>
          </div>
          <ol className="rail-flow">
            {RAILS.map((r, i) => (
              <li key={r.title} className="rail">
                <span className="rail-icon">
                  <Icon name={r.icon} filled={r.icon !== 'currency_bitcoin'} />
                </span>
                <span className="rail-tag">{r.tag}</span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
                {i < RAILS.length - 1 && <span className="rail-link" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </section>

        {/* ============ VERIFY ============ */}
        <section className="wrap verify" id="verifier">
          <div className="verify-grid">
            <div>
              <div className="eyebrow">Verify, don&apos;t trust</div>
              <h2 data-nm-reveal="words">Ne nous croyez pas. Vérifiez.</h2>
              <p data-nm-reveal="lines" data-nm-margin="10">
                Un dossier NobPay se contrôle sans compte et sans nous : votre navigateur recalcule l&apos;empreinte, relit tout le registre et interroge Bitcoin.
              </p>
              <Link href="/verifier" className="btn btn--dark nm-btn">
                Vérifier un dossier <Icon name="arrow_forward" size={22} />
              </Link>
            </div>
            <div className="checks" aria-label="Exemple de résultat de vérification">
              <div className="check">
                <i>
                  <Icon name="check" />
                </i>
                <div>
                  <strong>Le dossier est celui qui a été ancré</strong>
                  <span>L&apos;empreinte recalculée chez vous est identique.</span>
                </div>
              </div>
              <div className="check">
                <i>
                  <Icon name="check" />
                </i>
                <div>
                  <strong>Le registre n&apos;a pas été modifié</strong>
                  <span>Chaque événement contient l&apos;empreinte du précédent.</span>
                </div>
              </div>
              <div className="check">
                <i className="wait">
                  <Icon name="hourglass_top" />
                </i>
                <div>
                  <strong>L&apos;empreinte est dans la blockchain Bitcoin</strong>
                  <span>En attente d&apos;un bloc, en général quelques heures.</span>
                </div>
              </div>
              <small>Exemple de présentation : ce n&apos;est pas un dossier réel.</small>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="wrap faq" id="faq">
          <div className="section-head">
            <h2 data-nm-reveal="words">Questions franches</h2>
          </div>
          <div className="faq-list">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* ============ FINAL CALL ============ */}
      <footer className="final nm-grain" id="cta">
        <div className="final-coin fc-a" data-nm-parallax="-30">
          <div data-nm-float="a">
            <Coin id="f-dollar" palette={PALETTES.pearl} squash={0.72} tilt={-12} edge="right" thickness={22}>
              {SymbolDollar}
            </Coin>
          </div>
        </div>
        <div className="final-coin fc-b" data-nm-parallax="-50">
          <div data-nm-float="b">
            <Coin id="f-btc" palette={PALETTES.azure} squash={0.76} tilt={10} edge="left" thickness={24}>
              {SymbolBitcoin}
            </Coin>
          </div>
        </div>
        <div className="wrap" style={{ position: 'relative', zIndex: 2 }}>
          <h2 data-nm-reveal="words">
            Investissez au pays.
            <br />
            Avec preuve.
          </h2>
          <p data-nm-reveal="lines" data-nm-margin="10">
            Essayez le parcours complet : créer un projet, le financer, valider une preuve, puis vérifier le dossier.
          </p>
          <div className="cta-row">
            <Link href="/app" className="btn btn--white nm-btn">
              Ouvrir l&apos;application <Icon name="arrow_forward" size={22} />
            </Link>
            <Link href="/verifier" className="btn btn--ghost on-blue nm-btn">
              Vérifier un dossier
            </Link>
          </div>
          <div className="foot">
            <span>© 2026 NobPay · Code ouvert (licence MIT) · Prototype Code &amp; Chain Dakar</span>
            <nav aria-label="Pied de page">
              <Link href="/app">Application</Link>
              <Link href="/verifier">Vérifier</Link>
              <a href="#how">Comment ça marche</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
