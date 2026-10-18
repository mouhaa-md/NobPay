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
  // Heuristic for the "never live" rule: production keys are recognisable by their prefix (prd:live_...).
  const LIVE_KEY = /^(prd|live)[:_]|[:_]live[:_]/i;
  if (process.env.BITNOB_MODE === 'sandbox' && [process.env.BITNOB_CLIENT_ID, process.env.BITNOB_CLIENT_SECRET].some((k) => LIVE_KEY.test(k ?? ''))) {
    fatal.push("Les clés Bitnob ressemblent à des clés de production (live). NobPay ne s'utilise qu'avec des clés sandbox : révoquez-les et créez-en en mode Sandbox.");
  }
  return { fatal, warnings };
}
