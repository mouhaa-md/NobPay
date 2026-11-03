import { sessionSecretMustBeStrong } from './server/config';
import { readDb } from './server/db';
import { startJobs } from './server/jobs';
import { checkStartupConfig } from './server/startup';

/**
 * Refuses to start with an unsafe configuration, and says out loud when demo conveniences are on
 * next to real Bitnob keys.
 */
const { fatal, warnings } = checkStartupConfig();
for (const w of warnings) console.warn(`[nobpay] ATTENTION : ${w}`);
if (fatal.length) throw new Error(`[nobpay] Démarrage refusé :\n- ${fatal.join('\n- ')}`);
// an unreadable database must stop the start here, in the logs, not surface at the first visit of a funder
if (sessionSecretMustBeStrong()) await readDb();
startJobs();
