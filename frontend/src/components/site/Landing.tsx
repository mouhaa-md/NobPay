import Link from 'next/link';
import { Coin, PALETTES, SymbolBitcoin, SymbolDollar } from '@/components/site/Coin';
import { HeroArt } from '@/components/site/HeroArt';
import { LANDING_COPY, SOURCE_URLS, type Lang } from '@/components/site/landingCopy';
import { MotionProvider } from '@/components/site/MotionProvider';
import { Phone } from '@/components/site/Phone';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { SECTORS, STEP_TEMPLATES } from '@/lib/templates';
import { SECTORS_EN, stepTitleEn } from '@/lib/templatesEn';
import type { Sector } from '@/lib/types';

const SECTOR_ORDER: Sector[] = ['immobilier', 'agricole', 'commerce', 'scolarite', 'approvisionnement'];
const SECTOR_NOTE_FR: Record<Sector, string> = {
  immobilier: 'Titre foncier vérifié avant le premier paiement, puis chaque phase du chantier sur photos datées.',
  agricole: 'Intrants, semis, récolte : chaque achat est prouvé par une facture et une photo du terrain.',
  commerce: 'Du premier achat de stock à la mise en rayon : le fournisseur est payé quand la marchandise arrive.',
  scolarite: 'Les frais d’école d’un enfant, payés à l’école trimestre après trimestre, sur présentation du reçu.',
  approvisionnement: 'Le commerçant commande, le grossiste est payé à la livraison : plus d’avance perdue ni de livraison contestée.',
};
const PHONES = ['/site/phone-financer.webp', '/site/phone-preuve.webp', '/site/phone-liberer.webp', '/site/phone-verifier.webp'];

/** The landing page, in French (`/`) or in English (`/en`): same layout, the text comes from landingCopy.ts. */
export function Landing({ lang }: { lang: Lang }) {
  const c = LANDING_COPY[lang];
  // the language chosen on this page follows the visitor into the app
  const to = (path: string) => `/lang/${lang}?next=${path}`;
  const sector = (id: Sector) =>
    lang === 'en'
      ? { label: SECTORS_EN[id].label, tagline: SECTORS_EN[id].tagline, note: SECTORS_EN[id].note, steps: STEP_TEMPLATES[id].map((t) => stepTitleEn(t.title)) }
      : { label: SECTORS[id].label, tagline: SECTORS[id].tagline, note: SECTOR_NOTE_FR[id], steps: STEP_TEMPLATES[id].map((t) => t.title) };

  return (
    <div className="site" lang={c.htmlLang}>
      <MotionProvider />

      {/* ============ HERO ============ */}
      <section className="hero nm-grain" data-nm-parallax-root>
        <header className="site-header">
          <Link href={lang === 'en' ? '/en' : '/'} className="site-logo" aria-label={c.nav.logoLabel}>
            <Logo tone="light" />
          </Link>
          <nav className="site-nav" aria-label={c.nav.navLabel}>
            <a href="#how" className="hide-sm">
              {c.nav.how}
            </a>
            <a href="#secteurs" className="hide-sm">
              {c.nav.corridors}
            </a>
            <Link href={to('/verifier')} className="hide-sm">
              {c.nav.verify}
            </Link>
            <Link href={c.nav.switchHref} hrefLang={lang === 'en' ? 'fr' : 'en'} lang={lang === 'en' ? 'fr' : 'en'} aria-label={`${c.nav.switchLabel}: ${c.nav.switchTo}`}>
              {c.nav.switchTo}
            </Link>
            <Link href={to('/app')} className="pill nm-btn">
              {c.nav.open}
            </Link>
          </nav>
        </header>

        <HeroArt />

        <div className="hero-text">
          <h1 data-nm-reveal="words">
            {c.hero.title.lead}
            <br />
            <em>{c.hero.title.em}</em>
          </h1>
          <p className="hero-sub" data-nm-reveal="lines">
            {c.hero.sub}
          </p>
          <div className="cta-row">
            <Link href={to('/app')} className="btn nm-btn">
              {c.hero.cta} <Icon name="arrow_forward" size={22} />
            </Link>
            <Link href={to('/verifier')} className="btn btn--ghost nm-btn">
              {c.hero.verify}
            </Link>
          </div>
          <span className="tag">
            <Icon name="science" size={16} /> {c.hero.tag}
          </span>
        </div>
      </section>

      <main>
        {/* ============ WHY ============ */}
        <section className="wrap why" aria-labelledby="constat">
          <div className="why-grid">
            <div className="why-copy">
              <div className="eyebrow">{c.why.eyebrow}</div>
              <h2 id="constat" data-nm-reveal="words">
                {c.why.title.lead} <em>{c.why.title.em}</em>
              </h2>
              <p data-nm-reveal="lines" data-nm-margin="10">
                {c.why.text}
              </p>
            </div>
            <div>
              <dl className="stats">
                {c.why.stats.map((s) => (
                  <div key={s.value} className="stat">
                    <dt>
                      <strong>
                        {s.value}
                        <small>{s.unit}</small>
                      </strong>
                    </dt>
                    <dd>{s.text}</dd>
                  </div>
                ))}
              </dl>
              <p className="sources">
                {c.why.sourcePrefix}
                <a href={SOURCE_URLS.un} target="_blank" rel="noopener noreferrer">
                  {c.why.sourceUn}
                </a>
                {c.why.sourceAnd}
                <a href={SOURCE_URLS.ifad} target="_blank" rel="noopener noreferrer">
                  {c.why.sourceIfad}
                </a>
                {c.why.sourceSuffix}
              </p>
            </div>
          </div>
        </section>

        {/* ============ HOW (blue, real screens) ============ */}
        <section className="how nm-grain" id="how">
          <div className="wrap">
            <div className="how-head">
              <div className="chip chip--dark">
                {c.how.chip} <i>⚡</i>
              </div>
              <h2 data-nm-reveal="words">
                {c.how.title.lead} <em>{c.how.title.em}</em>
              </h2>
              <p data-nm-reveal="lines" data-nm-margin="10">
                {c.how.text}
              </p>
            </div>

            <div className="tabs" data-nm-tabs data-nm-delay="5000" role="tablist">
              <div className="tab-list">
                {c.how.steps.map((s, i) => (
                  <div key={s.name} className="tab" data-nm-tab role="tab">
                    <div className="nm-tab-title">
                      <span>{`0${i + 1}`}</span> {s.name}
                    </div>
                    <ul className="nm-tab-list">
                      {s.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <span className="nm-tab-progress">
                      <i />
                    </span>
                  </div>
                ))}
              </div>

              <div className="panels" data-nm-panels>
                {c.how.steps.map((s, i) => (
                  <div key={s.name} className="nm-panel" data-nm-panel>
                    <Phone src={PHONES[i]} alt={s.alt} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ CORRIDORS ============ */}
        <section className="wrap sectors" id="secteurs">
          <div className="section-head">
            <div className="eyebrow">{c.corridors.eyebrow}</div>
            <h2 data-nm-reveal="words">
              {c.corridors.title.lead} <em>{c.corridors.title.em}</em>
            </h2>
            <p data-nm-reveal="lines" data-nm-margin="10">
              {c.corridors.text}
            </p>
          </div>
          <div className="sector-grid">
            {SECTOR_ORDER.map((id) => {
              const s = sector(id);
              return (
                <article key={id} className="sector">
                  <div className="sector-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={SECTORS[id].cover} alt="" loading="lazy" />
                    <span className="sector-tag">
                      <Icon name={SECTORS[id].icon} size={18} /> {s.label}
                    </span>
                  </div>
                  <div className="sector-body">
                    <h3>{s.tagline}</h3>
                    <p>{s.note}</p>
                    <ol>
                      {s.steps.map((t) => (
                        <li key={t}>{t}</li>
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
              <div className="eyebrow">{c.peek.eyebrow}</div>
              <h2 data-nm-reveal="words">
                {c.peek.title.lead} <em>{c.peek.title.em}</em>
              </h2>
              <p data-nm-reveal="lines" data-nm-margin="10">
                {c.peek.text}
              </p>
              <ul className="ticks">
                {c.peek.ticks.map((t) => (
                  <li key={t}>
                    <Icon name="check_circle" filled size={22} /> {t}
                  </li>
                ))}
              </ul>
              <Link href={to('/app')} className="btn nm-btn">
                {c.peek.cta} <Icon name="arrow_forward" size={22} />
              </Link>
            </div>
            <div className="peek-phones" aria-hidden="false">
              <div className="peek-a" data-nm-float="b">
                <Phone src="/site/phone-accueil.webp" alt={c.peek.altHome} />
              </div>
              <div className="peek-b" data-nm-float="a">
                <Phone src="/site/phone-projet.webp" alt={c.peek.altProject} />
              </div>
            </div>
          </div>
        </section>

        {/* ============ RAILS ============ */}
        <section className="wrap rails" id="rails">
          <div className="section-head">
            <div className="eyebrow">{c.rails.eyebrow}</div>
            <h2 data-nm-reveal="words">
              {c.rails.title.lead} <em>{c.rails.title.em}</em>
            </h2>
            <p data-nm-reveal="lines" data-nm-margin="10">
              {c.rails.text}
            </p>
          </div>
          <ol className="rail-flow">
            {c.rails.items.map((r, i) => (
              <li key={r.title} className="rail">
                <span className="rail-icon">
                  <Icon name={r.icon} filled={r.icon !== 'currency_bitcoin'} />
                </span>
                <span className="rail-tag">{r.tag}</span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
                {i < c.rails.items.length - 1 && <span className="rail-link" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </section>

        {/* ============ VERIFY ============ */}
        <section className="wrap verify" id="verifier">
          <div className="verify-grid">
            <div>
              <div className="eyebrow">{c.verify.eyebrow}</div>
              <h2 data-nm-reveal="words">
                {c.verify.title.lead} <em>{c.verify.title.em}</em>
              </h2>
              <p data-nm-reveal="lines" data-nm-margin="10">
                {c.verify.text}
              </p>
              <Link href={to('/verifier')} className="btn btn--dark nm-btn">
                {c.verify.cta} <Icon name="arrow_forward" size={22} />
              </Link>
            </div>
            <div className="checks" aria-label={c.verify.ariaLabel}>
              {c.verify.checks.map((k) => (
                <div key={k.title} className="check">
                  <i className={k.wait ? 'wait' : undefined}>
                    <Icon name={k.wait ? 'hourglass_top' : 'check'} />
                  </i>
                  <div>
                    <strong>{k.title}</strong>
                    <span>{k.text}</span>
                  </div>
                </div>
              ))}
              <small>{c.verify.example}</small>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="wrap faq" id="faq">
          <div className="section-head">
            <h2 data-nm-reveal="words">
              {c.faq.title.lead} <em>{c.faq.title.em}</em>
            </h2>
          </div>
          <div className="faq-list">
            {c.faq.items.map((item) => (
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
            {c.final.title.lead}
            <br />
            <em>{c.final.title.em}</em>
          </h2>
          <p data-nm-reveal="lines" data-nm-margin="10">
            {c.final.text}
          </p>
          <div className="cta-row">
            <Link href={to('/app')} className="btn btn--white nm-btn">
              {c.final.open} <Icon name="arrow_forward" size={22} />
            </Link>
            <Link href={to('/verifier')} className="btn btn--ghost on-blue nm-btn">
              {c.final.verify}
            </Link>
          </div>
          <div className="foot">
            <span>{c.final.copyright}</span>
            <nav aria-label={c.final.footerLabel}>
              <Link href={to('/app')}>{c.final.links.app}</Link>
              <Link href={to('/verifier')}>{c.final.links.verify}</Link>
              <a href="#how">{c.final.links.how}</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
