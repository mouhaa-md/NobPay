import { normalizePhone } from '@/server/auth';
import { respond } from '@/server/http';
import { requestOtp } from '@/server/otp';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { otpRequestSchema, readJson } from '@/server/validation';

export const dynamic = 'force-dynamic';

/**
 * Sends the sign-in code by SMS. With an SMS provider configured, the answer never contains the code.
 * Without one, and only if ALLOW_DEMO permits, the shared demo code is returned so the screen can show it.
 * Otherwise 503: no code exists, and we say so instead of pretending.
 */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request, otpRequestSchema);
    const phone = normalizePhone(body.phone);
    enforce(`otp:ip:${clientIp(request)}`, LIMITS.otpIp.max, LIMITS.otpIp.windowMs);
    enforce(`otp:phone:${phone}`, LIMITS.otpPhone.max, LIMITS.otpPhone.windowMs, 'Trop de codes demandés pour ce numéro');
    const delivery = await requestOtp(phone);
    return delivery.kind === 'demo' ? { sent: true, demo: true, demoCode: delivery.demoCode } : { sent: true, resendIn: delivery.resendIn };
  });
}
