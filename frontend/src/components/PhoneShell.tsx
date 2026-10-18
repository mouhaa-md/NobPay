/** Phone-width column, centered on larger screens (the app screens are designed mobile-first). */
export function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-screen justify-center bg-surface-container">
      <div className="relative flex min-h-screen w-full max-w-[480px] flex-col bg-background shadow-2xl">{children}</div>
    </div>
  );
}
