/** The witness's page: one column on the brand background, on a phone as on a computer (no account, no menu). */
export default function WitnessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-screen items-start justify-center bg-ocean px-4 py-8 sm:py-12">
      <div className="w-full max-w-[520px]">{children}</div>
    </div>
  );
}
