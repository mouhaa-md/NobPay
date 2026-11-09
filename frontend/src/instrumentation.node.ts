import { sessionSecretMustBeStrong } from './server/config';
import { readDb } from './server/db';
import { startJobs } from './server/jobs';
import { checkStartupConfig, refuseIfUnsafe } from './server/startup';

/**
 * Refuses to start with an unsafe configuration (the process stops with code 1, the reasons are in the log), and says out loud
 * when demo conveniences are on next to real Bitnob keys.
 */
const check = checkStartupConfig();
for (const w of check.warnings) console.warn(`[nobpay] ATTENTION : ${w}`);
refuseIfUnsafe(check);
// an unreadable database must stop the start here, in the logs, not surface at the first visit of a funder
if (sessionSecretMustBeStrong()) await readDb();
startJobs();
