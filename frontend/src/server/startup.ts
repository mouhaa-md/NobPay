import { isDemoAllowed, isRealBitcoin, sessionSecretMustBeStrong, sessionSecretProblem } from './config';
import { masterKeyProblem } from './nostr/keys';

export interface StartupCheck {
  /** the server must not start */
  fatal: string[];
  /** worth saying, but the server may start */
  warnings: string[];
}

/** Pure function of the environment, so it can be tested. */
export function checkStartupConfig(): StartupCheck {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const problem = sessionSecretProblem(process.env.SESSION_SECRET);

  if (problem && sessionSecretMustBeStrong()) fatal.push(problem);
  else if (problem && process.env.NODE_ENV === 'production') {
    warnings.push(`${problem} Acceptable pour une démonstration locale en mode simulé, pas pour une URL publique.`);
  }

  if (process.env.BITNOB_MODE === 'sandbox' && isDemoAllowed()) {
    warnings.push(
      'ALLOW_DEMO=1 avec le mode sandbox : le code SMS est le même pour tout le monde (DEMO_OTP). ' +
        "N'importe qui qui connaît un numéro peut ouvrir ce compte. À réserver à une démonstration devant des personnes de confiance.",
    );
  }
  if (process.env.SMS_PROVIDER?.toLowerCase() === 'log' && (process.env.BITNOB_MODE === 'sandbox' || process.env.NODE_ENV === 'production')) {
    warnings.push('SMS_PROVIDER=log : les codes de connexion sont écrits dans les journaux du serveur. Réservé au développement ; configurez un vrai fournisseur SMS.');
  }
  if (process.env.SMS_PROVIDER?.toLowerCase() === 'twilio' && !(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)) {
    warnings.push("SMS_PROVIDER=twilio mais TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN ou TWILIO_FROM manque : l'envoi de SMS est désactivé.");
  }
  // Heuristic for the "never live" rule: live keys carry a `live` marker (prd:live_...).
  const LIVE_KEY = /(^|[:_])live[:_]/i; // prd:live_... is live, prd:sandbox_... is not
  if (process.env.BITNOB_MODE === 'sandbox' && [process.env.BITNOB_CLIENT_ID, process.env.BITNOB_CLIENT_SECRET].some((k) => LIVE_KEY.test(k ?? ''))) {
    fatal.push("Les clés Bitnob ressemblent à des clés de production (live). NobPay ne s'utilise qu'avec des clés sandbox : révoquez-les et créez-en en mode Sandbox.");
  }
  if (isRealBitcoin()) {
    const receive = nwcUrlProblem(process.env.NWC_RECEIVE_URL);
    if (receive) {
      fatal.push(
        `LIGHTNING_RAIL=nwc demande NWC_RECEIVE_URL, une chaîne « nostr+walletconnect://… » avec relay et secret (${receive}). ` +
          'Créez la connexion dans votre portefeuille avec les droits : créer des factures, les consulter, lire le solde.',
      );
    }
    if (process.env.NWC_PAYOUT_URL) {
      const payout = nwcUrlProblem(process.env.NWC_PAYOUT_URL);
      if (payout) fatal.push(`NWC_PAYOUT_URL n’est pas une chaîne « nostr+walletconnect://… » valable (${payout}).`);
    } else {
      warnings.push('NWC_PAYOUT_URL est absent : les paiements vers une adresse Lightning et les remboursements sont désactivés (le financement reste possible).');
    }
    if (isDemoAllowed()) {
      fatal.push(
        'LIGHTNING_RAIL=nwc exige ALLOW_DEMO=0 : le code de connexion partagé du mode démonstration permettrait de prendre un compte qui contient de vrais sats. ' +
          'Utilisez ALLOW_GUEST=1 pour que le jury essaie sans compte, ou un vrai fournisseur SMS.',
      );
    }
  }
  if (process.env.AI_REVIEW === '1' && !process.env.ANTHROPIC_API_KEY) {
    warnings.push("AI_REVIEW=1 mais ANTHROPIC_API_KEY est absente : l'avis de l'IA sur les preuves est désactivé.");
  }
  if (process.env.NOSTR_PUBLISH === '1') {
    const key = masterKeyProblem();
    if (key) fatal.push(`NOSTR_MASTER_KEY ${key}.`);
    else if (!process.env.NOSTR_MASTER_KEY && problem) {
      // the project keys would come from a public or weak secret: anyone could sign commitments in the project's name
      fatal.push(`NOSTR_PUBLISH=1 sans NOSTR_MASTER_KEY, et ${problem.charAt(0).toLowerCase()}${problem.slice(1)} Les clés Nostr des projets seraient devinables : définissez NOSTR_MASTER_KEY (openssl rand -hex 32).`);
    } else if (!process.env.NOSTR_MASTER_KEY && (isRealBitcoin() || process.env.NODE_ENV === 'production')) {
      warnings.push(
        'NOSTR_PUBLISH=1 sans NOSTR_MASTER_KEY : les clés Nostr des projets sont dérivées de SESSION_SECRET, et changer ce secret en changerait toutes les clés. ' +
          'Définissez NOSTR_MASTER_KEY (openssl rand -hex 32) et sauvegardez-la : elle seule permet de continuer à signer les engagements des projets existants.',
      );
    }
  }
  return { fatal, warnings };
}

/**
 * Why a Nostr Wallet Connect string cannot be used, or null when it is fine:
 * nostr+walletconnect://<wallet pubkey, 64 hex>?relay=wss://...&secret=<64 hex>.
 */
export function nwcUrlProblem(value: string | undefined): string | null {
  if (!value) return 'absente';
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return 'illisible';
  }
  if (url.protocol !== 'nostr+walletconnect:') return 'mauvais préfixe';
  if (!/^[0-9a-f]{64}$/i.test(url.host)) return 'clé publique du portefeuille invalide';
  if (!/^[0-9a-f]{64}$/i.test(url.searchParams.get('secret') ?? '')) return 'secret absent ou invalide';
  const relays = url.searchParams.getAll('relay');
  if (relays.length === 0 || relays.some((r) => !/^wss?:\/\/[^\s]+$/i.test(r))) return 'relais absent ou invalide';
  return null;
}
