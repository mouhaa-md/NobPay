import { AuthAside } from '@/components/app/AuthAside';
import { getConfig } from '@/server/config';

/**
 * Sign-in screens. Phone: one centered column. Computer: brand panel on the left, the form on the right.
 * Each page hides its own hero on a computer because the panel takes that role.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen bg-surface-container lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:bg-background">
      <AuthAside mode={getConfig().mode} />
      <div className="flex justify-center lg:min-h-screen lg:items-center">
        <div className="relative flex min-h-screen w-full max-w-[480px] flex-col bg-background shadow-2xl lg:min-h-0 lg:max-w-[440px] lg:px-8 lg:py-12 lg:shadow-none">{children}</div>
      </div>
    </div>
  );
}
