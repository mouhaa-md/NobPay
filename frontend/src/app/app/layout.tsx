/** The app has two frames: the phone column for sign-in screens ((auth)) and the shared shell for everything else ((shell)). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
