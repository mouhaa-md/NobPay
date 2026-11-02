'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OtpInput } from '@/components/app/OtpInput';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner, buttonPrimary } from '@/components/ui/primitives';
import { RESIDENCE_COUNTRIES } from '@/lib/templates';
import { Tc, useT } from '@/lib/i18n/client';

type Mode = 'register' | 'login';

async function post(t: (fr: string) => string, url: string, body?: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? t('Une erreur est survenue'));
  return json;
}

/** Sign-up (names + country + phone, then SMS code) and sign-in (phone, then SMS code). Demo code, no SMS provider. */
export function AuthForm({ mode }: { mode: Mode }) {
  const t = useT();
  const router = useRouter();
  const [stage, setStage] = useState<1 | 2>(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState('FR');
  const [local, setLocal] = useState('');
  const [otp, setOtp] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);

  const dial = RESIDENCE_COUNTRIES.find((c) => c.code === country)?.dial ?? '+33';
  const phone = `${dial}${local.replace(/\D/g, '').replace(/^0+/, '')}`;
  const register = mode === 'register';

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const sendCode = async () => {
    setError('');
    if (register && (!firstName.trim() || !lastName.trim())) return setError(t('Indiquez votre prénom et votre nom'));
    if (local.replace(/\D/g, '').length < 6) return setError(t('Indiquez un numéro de téléphone valide'));
    setBusy(true);
    try {
      const json = await post(t, '/api/auth/otp', { phone });
      setDemoCode(json.demoCode ?? '');
      setStage(2);
      setWait(45);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError('');
    if (otp.length !== 6) return setError(t('Entrez les 6 chiffres du code'));
    setBusy(true);
    try {
      await post(t, register ? '/api/auth/register' : '/api/auth/login', register ? { firstName, lastName, country, phone, otp } : { phone, otp });
      router.push('/app/accueil');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const field =
    'h-12 w-full rounded-2xl bg-surface-container-low px-space-md font-body-md text-on-surface outline-none transition placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container';

  return (
    <div className="flex flex-col gap-space-md">
      {stage === 1 ? (
        <form
          className="flex flex-col gap-space-sm"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          {register && (
            <div className="grid grid-cols-2 gap-space-sm">
              <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                <Tc>Prénom</Tc>
                <input className={field} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" placeholder={t('Aminata')} />
              </label>
              <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                <Tc>Nom</Tc>
                <input className={field} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" placeholder={t('Sow')} />
              </label>
            </div>
          )}
          <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
            <Tc>Pays de résidence</Tc>
            <span className="relative flex items-center">
              <span className="pointer-events-none absolute left-4">
                <Flag code={country} />
              </span>
              <select className={`${field} appearance-none pl-14 pr-10`} value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country">
                {RESIDENCE_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Icon name="keyboard_arrow_down" className="pointer-events-none absolute right-4 text-on-surface-variant" />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
            <Tc>Téléphone mobile</Tc>
            <span className="flex items-center gap-space-xs rounded-2xl bg-surface-container-low p-1.5 focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-container">
              <span className="flex h-9 items-center gap-1.5 rounded-xl bg-surface-container px-3 font-title-md text-title-md font-bold text-on-surface">
                <Flag code={country} className="h-3.5 w-5" />
                {dial}
              </span>
              <input
                className="w-full bg-transparent py-2 pr-3 font-body-lg text-on-surface outline-none placeholder:text-outline"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="6 12 34 56 78"
              />
            </span>
          </label>
          <ErrorNote>{error}</ErrorNote>
          <button type="submit" className={buttonPrimary} disabled={busy}>
            {busy ? <Spinner /> : null}
            <span><Tc>Recevoir le code</Tc></span>
            <Icon name="arrow_forward" size={20} />
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-space-sm">
          <div className="rounded-2xl bg-surface-container-low p-space-md">
            <div className="mb-space-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface">
                <Icon name="sms" size={16} className="text-primary" /> <Tc>Code de confirmation</Tc>
              </span>
              <button type="button" className="font-label-sm text-label-sm font-semibold text-primary hover:underline" onClick={() => setStage(1)}>
                <Tc>Modifier le numéro</Tc>
              </button>
            </div>
            <OtpInput value={otp} onChange={setOtp} invalid={!!error && otp.length === 6} />
            <div className="mt-space-sm flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span className="flex items-center gap-1">
                <Icon name="schedule" size={14} />
                {wait > 0 ? t('Renvoyer le code (0:{padStart})', { padStart: String(wait).padStart(2, '0') }) : t('Vous pouvez redemander un code')}
              </span>
              <button type="button" disabled={wait > 0} onClick={sendCode} className="font-label-sm text-label-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50">
                <Tc>Renvoyer</Tc>
              </button>
            </div>
          </div>
          {demoCode && (
            <div className="flex items-start gap-3 rounded-2xl bg-tertiary-fixed/50 p-space-sm text-on-tertiary-fixed">
              <Icon name="info" size={20} className="mt-0.5 shrink-0" />
              <p className="font-body-sm text-body-sm">
                <strong><Tc>Prototype :</Tc></strong> <Tc>aucun SMS n&apos;est envoyé. Code de démonstration :</Tc> <strong className="tracking-widest">{demoCode}</strong>{' '}
                <button type="button" className="font-semibold underline" onClick={() => setOtp(demoCode)}>
                  <Tc>Remplir</Tc>
                </button>
              </p>
            </div>
          )}
          <ErrorNote>{error}</ErrorNote>
          <button type="button" className={buttonPrimary} disabled={busy || otp.length !== 6} onClick={submit}>
            {busy ? <Spinner /> : null}
            <span>{register ? t('Créer mon compte') : t('Me connecter')}</span>
            <Icon name="arrow_forward" size={20} />
          </button>
        </div>
      )}
      <p className="text-center font-body-sm text-body-sm text-on-surface-variant">
        {register ? (
          <>
            <Tc>Déjà un compte ?</Tc>{' '}
            <Link href="/app/connexion" className="font-semibold text-primary underline">
              <Tc>Connexion</Tc>
            </Link>
          </>
        ) : (
          <>
            <Tc>Pas encore de compte ?</Tc>{' '}
            <Link href="/app/inscription" className="font-semibold text-primary underline">
              <Tc>Créer un compte</Tc>
            </Link>
          </>
        )}
      </p>
      {register && (
        <p className="text-center font-body-sm text-body-sm text-outline">
          <Tc>En continuant, vous acceptez les conditions d&apos;utilisation de NobPay (prototype de hackathon).</Tc>
        </p>
      )}
    </div>
  );
}
