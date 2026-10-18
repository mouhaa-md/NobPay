import { getConfig, sessionSecretMustBeStrong, sessionSecretProblem } from './config';
import { HttpError } from './http';

/** Throws when the configuration says the secret must be strong and it is not. */
export function assertSessionSecret(): string {
  const { sessionSecret } = getConfig();
  if (sessionSecretMustBeStrong()) {
    const problem = sessionSecretProblem(process.env.SESSION_SECRET);
    if (problem) throw new HttpError(500, `Configuration refusée : ${problem}`, 'weak_session_secret');
  }
  return sessionSecret;
}
