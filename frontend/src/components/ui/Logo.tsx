/**
 * NobPay logo: "nobpay" in lowercase, the n being a stone arch whose keystone is orange.
 * Paths come from docs/brand (nobpay-logo.svg); the size follows the font size of the caller (className="text-[22px]").
 */
const INK_PATH =
  'M0 100V46.5A48 48 0 0 1 28.408 2.68L34.783 18.459A31 31 0 0 0 17 46.5V100ZM61.217 18.459L67.592 2.68A48 48 0 0 1 96 46.5V100H79V46.5A31 31 0 0 0 61.217 18.459ZM109 50A51.5 51.5 0 1 1 212 50A51.5 51.5 0 1 1 109 50ZM126 50A34.5 34.5 0 1 0 195 50A34.5 34.5 0 1 0 126 50ZM224 -40H241V11.764A51.5 51.5 0 1 1 241 88.236V100H224ZM241 50A34.5 34.5 0 1 0 310 50A34.5 34.5 0 1 0 241 50ZM338 0H355V11.764A51.5 51.5 0 1 1 355 88.236V140H338ZM355 50A34.5 34.5 0 1 0 424 50A34.5 34.5 0 1 0 355 50ZM535 0H552V100H535V88.236A51.5 51.5 0 1 1 535 11.764ZM466 50A34.5 34.5 0 1 0 535 50A34.5 34.5 0 1 0 466 50ZM560 0H578.7L608.733 76.419L639.3 0H658L602 140H583.3L599.3 100Z';
const KEY_PATH = 'M38.028 17.148L31.653 1.369A48 48 0 0 1 64.347 1.369L57.972 17.148A31 31 0 0 0 38.028 17.148Z';

export function Logo({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <span className={`inline-flex items-center leading-none ${className}`}>
      <svg viewBox="0 -40 658 180" role="img" aria-label="NobPay" style={{ height: '1.05em', width: 'auto', aspectRatio: '658 / 180' }}>
        <path fill={tone === 'light' ? '#FFFFFF' : '#0B132B'} fillRule="evenodd" d={INK_PATH} />
        <path fill="#F7931A" d={KEY_PATH} />
      </svg>
    </span>
  );
}
