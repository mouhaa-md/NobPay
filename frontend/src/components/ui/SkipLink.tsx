'use client';

/**
 * "Aller au contenu": first stop of the keyboard, hidden until it gets the focus (WCAG 2.4.1).
 * Some pages draw one <main> for the phone and one for the computer (only one is visible), so the target is the first
 * <main> that is really on screen rather than a fixed id.
 */
export function SkipLink() {
  return (
    <a
      href="#contenu"
      className="skip-link"
      onClick={(e) => {
        const main = [...document.querySelectorAll<HTMLElement>('main')].find((m) => m.getClientRects().length > 0);
        if (!main) return; // no visible <main>: let the browser follow the #contenu anchor
        e.preventDefault();
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: false });
      }}
    >
      Aller au contenu
    </a>
  );
}
