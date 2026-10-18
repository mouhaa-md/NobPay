import { BottomNav } from '@/components/app/BottomNav';

export const dynamic = 'force-dynamic';

/** Tab screens add the bottom bar on phones (the sidebar replaces it on a computer). */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
