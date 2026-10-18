import './site.css';

/**
 * The inline script hides the reveal texts until the animation kit is ready, so there is no flash of unstyled
 * text. If the kit never starts (script blocked, slow device), the class is removed after 3 s and all text shows.
 */
const HIDE_UNTIL_READY = "document.documentElement.classList.add('nm-js');setTimeout(function(){if(!window.__nmReady)document.documentElement.classList.remove('nm-js')},3000)";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: HIDE_UNTIL_READY }} />
      {children}
    </>
  );
}
