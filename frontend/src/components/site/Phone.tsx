/** A phone frame around a real screenshot of the app (demo data). Pure CSS, no image of a device. */
export function Phone({ src, alt, className = '', priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <figure className={`phone ${className}`}>
      <div className="phone-body">
        <span className="phone-island" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={780} height={1688} loading={priority ? 'eager' : 'lazy'} decoding="async" />
      </div>
    </figure>
  );
}
