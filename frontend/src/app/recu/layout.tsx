/** The supplier's receipt: a single card centered on the brand background, on a phone as on a computer. */
export default function ReceiptLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-screen items-start justify-center bg-ocean px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-[460px]">{children}</div>
    </div>
  );
}
