import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ invoiceStatus: vi.fn() }));
vi.mock('@/server/bitnob', () => ({
  getGateway: () => ({ mode: 'sandbox', ...fake }),
  gatewayFor: () => ({ mode: 'sandbox', ...fake }),
}));

let services: typeof import('@/server/services');
let db: typeof import('@/server/db');
const SATS = 122_630;

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-poll-'));
  process.env.BITNOB_MODE = 'sandbox';
  process.env.BITNOB_WEBHOOK_SECRET = 'whsec_poll';
  services = await import('@/server/services');
  db = await import('@/server/db');
});
beforeEach(async () => {
  await db.resetDb();
  fake.invoiceStatus.mockReset();
  vi.useRealTimers();
});

let n = 0;
const addFunding = async () => {
  const id = `f_poll${++n}`;
  await db.withDb((d) => {
    d.fundings.push({
      id, projectId: 'p_champ', amountCents: 10_000, method: 'lightning', status: 'pending', reference: `nobpay:fund:${id}`, mode: 'sandbox',
      createdAt: new Date().toISOString(), invoiceId: `inv_${id}`, paymentHash: id.padEnd(64, 'b'), amountSats: SATS, expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
  });
  return id;
};
const get = async (id: string) => (await db.readDb()).fundings.find((f) => f.id === id)!;

describe('polling fallback for pending sandbox invoices', () => {
  it('credits an invoice Bitnob reports as paid, with the right amount', async () => {
    const id = await addFunding();
    fake.invoiceStatus.mockResolvedValue({ status: 'paid', preimage: 'ab'.repeat(32), amountSats: SATS });
    await services.pollPendingFundings();
    expect((await get(id)).status).toBe('paid');
    expect((await get(id)).preimage).toBe('ab'.repeat(32));
  });

  it('credits nothing when Bitnob reports a different amount, and records why', async () => {
    const id = await addFunding();
    fake.invoiceStatus.mockResolvedValue({ status: 'paid', amountSats: SATS - 5000 });
    await services.settleFromGateway(id);
    const f = await get(id);
    expect(f.status).toBe('pending');
    expect(f.note).toContain(String(SATS - 5000));
  });

  it('still credits when Bitnob gives no amount (the same tolerance as the webhook)', async () => {
    const id = await addFunding();
    fake.invoiceStatus.mockResolvedValue({ status: 'paid' });
    await services.settleFromGateway(id);
    expect((await get(id)).status).toBe('paid');
  });

  it('leaves pending invoices alone and asks each at most every 10 seconds', async () => {
    const id = await addFunding();
    fake.invoiceStatus.mockResolvedValue({ status: 'pending' });
    await services.pollPendingFundings();
    await services.pollPendingFundings();
    expect(fake.invoiceStatus).toHaveBeenCalledTimes(1);
    expect((await get(id)).status).toBe('pending');
  });

  it('does not ask about invoices that are already paid, expired or simulated', async () => {
    await db.withDb((d) => {
      const base = { projectId: 'p_champ', amountCents: 1, method: 'lightning' as const, createdAt: new Date().toISOString() };
      d.fundings.push({ ...base, id: 'f_paid', status: 'paid', reference: 'a', mode: 'sandbox', invoiceId: 'i1' }, { ...base, id: 'f_mock', status: 'pending', reference: 'b', mode: 'mock', invoiceId: 'i2' });
    });
    await services.pollPendingFundings();
    expect(fake.invoiceStatus).not.toHaveBeenCalled();
  });

  it('a Bitnob outage does not break the loop (the error is swallowed by the caller, the invoice stays pending)', async () => {
    const id = await addFunding();
    fake.invoiceStatus.mockRejectedValue(new Error('Bitnob injoignable'));
    await expect(services.pollPendingFundings()).rejects.toThrow(); // the job wraps each task in try/catch
    expect((await get(id)).status).toBe('pending');
  });

  it('one failing invoice does not stop the others from being checked', async () => {
    const bad = await addFunding();
    const good = await addFunding();
    fake.invoiceStatus.mockImplementation(async (invoiceId: string) => {
      if (invoiceId === `inv_${bad}`) throw new Error('boom');
      return { status: 'paid', amountSats: SATS };
    });
    await expect(services.pollPendingFundings()).rejects.toThrow('boom');
    expect((await get(good)).status).toBe('paid');
    expect((await get(bad)).status).toBe('pending');
  });
});
