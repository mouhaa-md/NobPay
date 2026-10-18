import { Sidebar } from '@/components/app/Sidebar';

export interface FrameUser {
  firstName: string;
  lastName: string;
  country: string;
  demo: boolean;
  /** Can open the read-only back-office (see server/admin.ts). */
  admin: boolean;
}

/**
 * Frame of the signed-in app.
 *  - below 1024 px: a phone-width column (bottom bar, fixed header), centered on the screen;
 *  - from 1024 px: a fixed sidebar and the content on the whole remaining width (each page sets its own max width).
 */
export function AppFrame({ user, mode, children }: { user: FrameUser; mode: 'mock' | 'sandbox'; children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen bg-surface-container lg:bg-background">
      <Sidebar user={user} mode={mode} />
      <div className="flex justify-center lg:block lg:pl-[260px]">
        <div className="relative flex min-h-screen w-full max-w-[480px] flex-col bg-background shadow-2xl lg:max-w-none lg:pt-16 lg:shadow-none">{children}</div>
      </div>
    </div>
  );
}
