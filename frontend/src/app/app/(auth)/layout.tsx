import { PhoneShell } from '@/components/PhoneShell';

/** Sign-in screens stay in a centered phone-width column, also on a computer. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PhoneShell>{children}</PhoneShell>;
}
