import { isDemoAllowed, sessionSecretMustBeStrong, sessionSecretProblem } from './config';

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
  return { fatal, warnings };
}
