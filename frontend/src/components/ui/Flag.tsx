/** Small SVG flags (emoji flags render as two letters on Windows). */
export function Flag({ code, className = 'h-4 w-6' }: { code: string; className?: string }) {
  const common = { viewBox: '0 0 24 16', className: `${className} rounded-[3px] shrink-0 ring-1 ring-black/10`, 'aria-hidden': true } as const;
  switch (code) {
    case 'FR':
      return (
        <svg {...common}><rect width="8" height="16" fill="#0055a4" /><rect x="8" width="8" height="16" fill="#fff" /><rect x="16" width="8" height="16" fill="#ef4135" /></svg>
      );
    case 'BE':
      return (
        <svg {...common}><rect width="8" height="16" fill="#000" /><rect x="8" width="8" height="16" fill="#fdda24" /><rect x="16" width="8" height="16" fill="#ef3340" /></svg>
      );
    case 'IT':
      return (
        <svg {...common}><rect width="8" height="16" fill="#009246" /><rect x="8" width="8" height="16" fill="#fff" /><rect x="16" width="8" height="16" fill="#ce2b37" /></svg>
      );
    case 'ES':
      return (
        <svg {...common}><rect width="24" height="16" fill="#aa151b" /><rect y="4" width="24" height="8" fill="#f1bf00" /></svg>
      );
    case 'DE':
      return (
        <svg {...common}><rect width="24" height="5.4" fill="#000" /><rect y="5.3" width="24" height="5.4" fill="#d00" /><rect y="10.6" width="24" height="5.4" fill="#ffce00" /></svg>
      );
    case 'GB':
      return (
        <svg {...common}>
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0l24 16M24 0L0 16" stroke="#fff" strokeWidth="3" />
          <path d="M0 0l24 16M24 0L0 16" stroke="#c8102e" strokeWidth="1.2" />
          <path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="5" />
          <path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="3" />
        </svg>
      );
    case 'US':
      return (
        <svg {...common}>
          <rect width="24" height="16" fill="#fff" />
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <rect key={i} y={(i * 16) / 13} width="24" height={16 / 13} fill="#b22234" />
          ))}
          <rect width="10" height="8.6" fill="#3c3b6e" />
        </svg>
      );
    case 'CA':
      return (
        <svg {...common}><rect width="24" height="16" fill="#fff" /><rect width="6" height="16" fill="#d52b1e" /><rect x="18" width="6" height="16" fill="#d52b1e" /><circle cx="12" cy="8" r="3" fill="#d52b1e" /></svg>
      );
    case 'CH':
      return (
        <svg {...common}><rect width="24" height="16" fill="#d52b1e" /><path d="M10 4h4v3h3v2h-3v3h-4V9H7V7h3z" fill="#fff" /></svg>
      );
    case 'SN':
      return (
        <svg {...common}>
          <rect width="8" height="16" fill="#00853f" /><rect x="8" width="8" height="16" fill="#fdef42" /><rect x="16" width="8" height="16" fill="#e31b23" />
          <path d="M12 5.2l.9 2.2 2.3.1-1.8 1.5.6 2.3-2-1.3-2 1.3.6-2.3-1.8-1.5 2.3-.1z" fill="#00853f" />
        </svg>
      );
    case 'CI':
      return (
        <svg {...common}><rect width="8" height="16" fill="#f77f00" /><rect x="8" width="8" height="16" fill="#fff" /><rect x="16" width="8" height="16" fill="#009e60" /></svg>
      );
    case 'CM':
      return (
        <svg {...common}>
          <rect width="8" height="16" fill="#007a5e" /><rect x="8" width="8" height="16" fill="#ce1126" /><rect x="16" width="8" height="16" fill="#fcd116" />
          <path d="M12 5.2l.9 2.2 2.3.1-1.8 1.5.6 2.3-2-1.3-2 1.3.6-2.3-1.8-1.5 2.3-.1z" fill="#fcd116" />
        </svg>
      );
    default:
      return (
        <svg {...common}><rect width="24" height="16" fill="#cbdbf5" /></svg>
      );
  }
}
