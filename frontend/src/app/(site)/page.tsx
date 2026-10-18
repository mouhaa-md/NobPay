import type { Metadata } from 'next';
import Link from 'next/link';
import { MotionProvider } from '@/components/site/MotionProvider';
import { Icon } from '@/components/ui/Icon';
import { SECTORS, STEP_TEMPLATES } from '@/lib/templates';
import type { Sector } from '@/lib/types';

export const metadata: Metadata = {
  title: { absolute: 'NobPay · Investissez au pays. Avec preuve.' },
  description:
    "NobPay aide la diaspora à financer des projets immobiliers, agricoles et commerciaux au pays : l'argent reste en séquestre et n'est libéré qu'étape par étape, sur preuve, avec une trace ancrée sur Bitcoin.",
};

const SECTOR_ORDER: Sector[] = ['immobilier', 'agricole', 'commerce'];

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
    a: "Le prototype paie au Sénégal, par Wave, Orange Money ou Free Money. Les autres pays dépendront des réseaux que Bitnob permet de payer.",
  },
  {
    q: 'Le code est-il ouvert ?',
    a: "Oui, sous licence MIT. La vérification d'un dossier se fait dans votre navigateur et peut être relue ligne par ligne.",
  },
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
            <Link href="/verifier" className="hide-sm">
              Vérifier un dossier
            </Link>
            <Link href="/app" className="pill nm-btn">
              Ouvrir l&apos;app
            </Link>
          </nav>
        </header>

        <div className="coin-wrap c1" data-nm-parallax="-20">
          <div className="coin coin--green" data-nm-float="a">
            <Icon name="home" filled />
          </div>
        </div>
        <div className="coin-wrap c2" data-nm-parallax="-40">
          <div className="coin coin--btc" data-nm-float="b">
            <Icon name="currency_bitcoin" />
          </div>
        </div>
        <div className="coin-wrap c3" data-nm-parallax="-10">
          <div className="coin" data-nm-float="a">
            <Icon name="agriculture" />
          </div>
        </div>
        <div className="coin-wrap c4" data-nm-parallax="-80">
          <div className="coin coin--light" data-nm-float="b">
            <Icon name="storefront" />
          </div>
        </div>

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
        {/* ============ INTRO ============ */}
        <section className="wrap intro">
          <div className="chip">
            Bienvenue sur NobPay <i>✦</i>
          </div>
          <h2 data-nm-reveal="words">L&apos;argent de la diaspora, enfin vérifiable</h2>
          <p data-nm-reveal="lines" data-nm-margin="10">
            Pour que l&apos;argent envoyé au pays serve vraiment à ce pour quoi il a été envoyé.
          </p>
        </section>

        {/* ============ SOURCED FIGURES ============ */}
        <section className="wrap figures" aria-labelledby="chiffres">
          <h2 id="chiffres" className="sr-only">
            Le marché en chiffres
          </h2>
          <div className="figure-grid">
            <div className="figure">
              <strong>
                124,2<small>Md$</small>
              </strong>
              <p>envoyés par des migrants à leurs familles en Afrique en 2025.</p>
            </div>
            <div className="figure">
              <strong>
                1 $<small>sur 3</small>
              </strong>
              <p>des envois vers les pays à revenu faible ou intermédiaire arrive en zone rurale : près de 233 Md$ en 2025.</p>
            </div>
            <div className="figure">
              <strong>
                22<small>Md$ par an</small>
              </strong>
              <p>sont investis par les familles bénéficiaires dans l&apos;agriculture et l&apos;alimentation rurales (estimation, mêmes pays).</p>
            </div>
          </div>
          <p className="sources">
            Source : IFAD, nouveau rapport sur les envois de fonds, 14 septembre 2026, relayé par{' '}
            <a href="https://news.un.org/en/story/2026/09/1168330" target="_blank" rel="noopener noreferrer">
              ONU Info
            </a>{' '}
            et{' '}
            <a href="https://www.ifad.org/en/w/news/remittances-nearly-doubled-in-a-decade-to-reach-us-729-billion-in-2025-new-ifad-report-finds" target="_blank" rel="noopener noreferrer">
              l&apos;IFAD
            </a>
            . Ces chiffres décrivent le marché, pas les résultats de NobPay.
          </p>
        </section>

        {/* ============ BENTO ============ */}
        <section className="wrap bento">
          <div className="pair">
            <article className="card">
              <div className="art">
                <div className="nm-pucks" style={{ width: '100%' }}>
                  <span className="nm-puck puck pk-a" style={{ '--i': 0 } as React.CSSProperties}>
                    <Icon name="bolt" filled />
                  </span>
                  <span className="nm-puck puck pk-b" style={{ '--i': 1 } as React.CSSProperties}>
                    <Icon name="currency_bitcoin" />
                  </span>
                  <span className="nm-puck puck pk-c" style={{ '--i': 2 } as React.CSSProperties}>
                    <Icon name="check" />
                  </span>
                </div>
              </div>
              <div>
                <h3 data-nm-reveal="words" data-nm-margin="10">
                  Au-delà du simple transfert
                </h3>
                <p data-nm-reveal="lines">Un transfert déplace l&apos;argent. NobPay en contrôle l&apos;usage : fonds en séquestre, libérés étape par étape, sur preuve.</p>
              </div>
            </article>
            <article className="card">
              <p className="dark" data-nm-reveal="lines">
                Des rails ouverts : Lightning pour entrer, mobile money pour payer, Bitcoin pour prouver.
              </p>
              <div className="art">
                <div className="nm-swing" style={{ width: '100%', height: '16rem' }}>
                  <div className="nm-swing-arm" style={{ '--a': '9deg', '--d': '5.2s', '--delay': '-1s' } as React.CSSProperties}>
                    <span className="tile t1" style={{ left: '12%', top: '8%' }}>
                      <Icon name="bolt" filled />
                    </span>
                  </div>
                  <div className="nm-swing-arm" style={{ '--a': '7deg', '--d': '4.8s', '--delay': '-2.4s' } as React.CSSProperties}>
                    <span className="tile t4" style={{ left: '68%', top: '2%' }}>
                      <Icon name="currency_bitcoin" />
                    </span>
                  </div>
                  <div className="nm-swing-arm" style={{ '--a': '14deg', '--d': '5.6s', '--delay': '-3.2s' } as React.CSSProperties}>
                    <span className="tile t3" style={{ left: '48%', top: '58%' }}>
                      <Icon name="smartphone" />
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div className="pair flip">
            <article className="card">
              <p className="dark" data-nm-reveal="lines">
                Notre mission : redonner à chaque famille de la diaspora le contrôle de ce qu&apos;elle finance.
              </p>
              <div className="art">
                <div className="nm-orbits" style={{ width: 'min(100%, 24rem)' }}>
                  <div className="nm-orbit" style={{ '--inset': '2%', '--d': '17s' } as React.CSSProperties}>
                    <i />
                  </div>
                  <div className="nm-orbit" style={{ '--inset': '17%', '--d': '13s', '--delay': '-4s' } as React.CSSProperties}>
                    <i className="nm-blink" />
                  </div>
                  <div className="nm-orbit" style={{ '--inset': '32%', '--d': '11s', '--delay': '-2s' } as React.CSSProperties}>
                    <i />
                  </div>
                  <div className="orbit-btn">
                    <Link className="btn nm-btn nm-btn--swap" href="/app">
                      Essayer la démo
                    </Link>
                  </div>
                </div>
              </div>
            </article>
            <article className="card">
              <div className="art">
                <div className="nm-stack" style={{ width: '100%', '--u': '1.1rem' } as React.CSSProperties}>
                  {['photo_camera', 'receipt_long', 'verified', 'payments'].map((name, i) => (
                    <div key={name} className="nm-stack-card row" style={{ '--i': i } as React.CSSProperties}>
                      <b>
                        <Icon name={name} />
                      </b>
                      <span />
                      <em />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 data-nm-reveal="words" data-nm-margin="10">
                  Chaque étape laisse une trace
                </h3>
                <p data-nm-reveal="lines">Photos datées et localisées, facture, fournisseur payé directement : tout est inscrit dans un registre ancré sur Bitcoin.</p>
              </div>
            </article>
          </div>
        </section>

        {/* ============ SECTORS ============ */}
        <section className="wrap sectors" id="secteurs">
          <div className="section-head">
            <div className="chip">
              Trois secteurs <i>⌂</i>
            </div>
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.cover} alt="" loading="lazy" />
                  <div>
                    <h3>
                      <Icon name={s.icon} /> {s.label}
                    </h3>
                    <p>{s.tagline}</p>
                    <ol>
                      {STEP_TEMPLATES[id].map((t) => (
                        <li key={t.title}>{t.title}</li>
                      ))}
                    </ol>
                  </div>
                  <small>Image d&apos;illustration générée. Étapes modifiables dans l&apos;application.</small>
                </article>
              );
            })}
          </div>
        </section>

        {/* ============ HOW IT WORKS (blue) ============ */}
        <section className="solution nm-grain" id="how">
          <div className="wrap">
            <div className="chip">
              Comment ça marche <i>⚡</i>
            </div>
            <h2 data-nm-reveal="words">Financez, validez, payez, vérifiez.</h2>

            <div className="duo">
              <p data-nm-reveal="lines" data-nm-margin="10">
                Financez en Bitcoin Lightning. Vos fonds restent en séquestre, étape par étape.
              </p>
              <div className="toggle-art nm-toggle" data-nm-float="a">
                <div className="nm-toggle-platform" />
                <div className="nm-toggle-coin coin coin--btc">
                  <Icon name="currency_bitcoin" />
                </div>
                <div className="nm-toggle-arrow">
                  <Icon name="arrow_forward" />
                </div>
              </div>
              <p data-nm-reveal="lines" data-nm-margin="10">
                Chaque étape validée déclenche un paiement direct au fournisseur par mobile money, et laisse une preuve que n&apos;importe qui peut vérifier.
              </p>
            </div>

            <div className="tabs" data-nm-tabs data-nm-delay="4000" role="tablist">
              <div>
                <div className="tab" data-nm-tab role="tab">
                  <div className="nm-tab-title">1 · Financer</div>
                  <ul className="nm-tab-list">
                    <li>Un paiement Lightning depuis n&apos;importe quel portefeuille.</li>
                    <li>Les fonds restent en séquestre dans un portefeuille Bitnob lié au projet.</li>
                  </ul>
                  <span className="nm-tab-progress">
                    <i />
                  </span>
                </div>
                <div className="tab" data-nm-tab role="tab">
                  <div className="nm-tab-title">2 · Prouver</div>
                  <ul className="nm-tab-list">
                    <li>La personne de confiance sur place ouvre un lien privé.</li>
                    <li>Photos datées et localisées, facture, titre foncier.</li>
                  </ul>
                  <span className="nm-tab-progress">
                    <i />
                  </span>
                </div>
                <div className="tab" data-nm-tab role="tab">
                  <div className="nm-tab-title">3 · Libérer</div>
                  <ul className="nm-tab-list">
                    <li>Vous regardez la preuve, puis vous validez.</li>
                    <li>Le fournisseur est payé en mobile money, au taux affiché avant confirmation.</li>
                  </ul>
                  <span className="nm-tab-progress">
                    <i />
                  </span>
                </div>
                <div className="tab" data-nm-tab role="tab">
                  <div className="nm-tab-title">4 · Vérifier</div>
                  <ul className="nm-tab-list">
                    <li>Chaque événement s&apos;ajoute à un registre enchaîné.</li>
                    <li>Son empreinte est ancrée sur Bitcoin : n&apos;importe qui peut la contrôler.</li>
                  </ul>
                  <span className="nm-tab-progress">
                    <i />
                  </span>
                </div>
              </div>
              <div data-nm-panels>
                <div className="nm-panel" data-nm-panel>
                  <div className="panel-art">
                    <div className="nm-ripple" data-glyph="₿">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="nm-ripple-ring" style={{ '--i': i } as React.CSSProperties} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="nm-panel" data-nm-panel>
                  <div className="panel-art">
                    <div className="nm-orbits">
                      <div className="nm-orbit" style={{ '--inset': '6%', '--d': '15s' } as React.CSSProperties}>
                        <i />
                      </div>
                      <div className="nm-orbit" style={{ '--inset': '24%', '--d': '11s', '--delay': '-3s' } as React.CSSProperties}>
                        <i />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="nm-panel" data-nm-panel>
                  <div className="panel-art">
                    <div className="nm-pucks" style={{ width: '80%', '--nm-puck': '6rem' } as React.CSSProperties}>
                      <span className="nm-puck puck pk-a" style={{ '--i': 0 } as React.CSSProperties}>
                        <Icon name="photo_camera" />
                      </span>
                      <span className="nm-puck puck pk-b" style={{ '--i': 1 } as React.CSSProperties}>
                        <Icon name="verified" />
                      </span>
                      <span className="nm-puck puck pk-c" style={{ '--i': 2 } as React.CSSProperties}>
                        <Icon name="payments" />
                      </span>
                    </div>
                  </div>
                </div>
                <div className="nm-panel" data-nm-panel>
                  <div className="panel-art">
                    <div className="nm-ripple" data-glyph="✓" style={{ color: '#0defd1' }}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="nm-ripple-ring" style={{ '--i': i } as React.CSSProperties} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ VERIFY ============ */}
        <section className="wrap verify" id="verifier">
          <div className="verify-grid">
            <div>
              <div className="chip">
                Verify, don&apos;t trust <i>✓</i>
              </div>
              <h2 data-nm-reveal="words" style={{ marginTop: '2rem' }}>
                Ne nous croyez pas. Vérifiez.
              </h2>
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
        <div className="coin-wrap c5">
          <div className="coin coin--light" data-nm-float="a">
            <Icon name="attach_money" />
          </div>
        </div>
        <div className="coin-wrap c6">
          <div className="coin coin--btc" data-nm-float="b">
            <Icon name="currency_bitcoin" />
          </div>
        </div>
        <div className="wrap" style={{ position: 'relative', zIndex: 2 }}>
          <div className="logo-tile">
            <Icon name="bolt" filled />
          </div>
          <h2 data-nm-reveal="words">Investissez au pays. Avec preuve.</h2>
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
