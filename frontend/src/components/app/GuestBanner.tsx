import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Tc } from '@/lib/i18n/client';

/** Shown to a guest account: its only key is this browser, so the recovery link in the profile is worth keeping. */
export function GuestBanner() {
  return (
    <Link href="/app/profil" className="flex items-center gap-3 rounded-2xl bg-[#FFF7ED] p-3.5 ring-1 ring-[#F97316]/30 transition hover:shadow-md">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFEDD5] text-[#C26700]">
        <Icon name="key" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-title-md text-title-md text-[#9A3412]"><Tc>Gardez votre clé de récupération</Tc></span>
        <span className="block font-body-sm text-body-sm text-[#7C2D12]"><Tc>Espace invité : sans ce lien, vous ne le retrouverez pas si ce navigateur est effacé.</Tc></span>
      </span>
      <Icon name="chevron_right" className="text-[#9A3412]" />
    </Link>
  );
}
