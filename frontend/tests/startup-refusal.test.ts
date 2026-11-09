import { afterEach, describe, expect, it, vi } from 'vitest';
import { refuseIfUnsafe, type StartupIo } from '@/server/startup';

/**
 * A refused start has to STOP the process. It used to throw from the instrumentation hook: Next.js printed "Failed to prepare
 * server", kept running and answered HTTP 500 to everything, so a container stayed "Up" with a bad configuration and Docker's
 * restart policy never saw a failure. Found by the first Docker run.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const fakeIo = () => {
  const io = { error: vi.fn<StartupIo['error']>(), exit: vi.fn<StartupIo['exit']>(() => undefined as never) };
  return io;
};

describe('refuseIfUnsafe', () => {
  it('does nothing when there is no fatal problem, warnings included', () => {
    const io = fakeIo();
    refuseIfUnsafe({ fatal: [], warnings: ['a warning is not a refusal'] }, io);
    expect(io.error).not.toHaveBeenCalled();
    expect(io.exit).not.toHaveBeenCalled();
  });

  it('says every reason in the log, then stops the process with a failure code', () => {
    const io = fakeIo();
    refuseIfUnsafe({ fatal: ['SESSION_SECRET est trop court.', 'VAPID_PUBLIC_KEY n’est pas valable.'], warnings: [] }, io);
    expect(io.error).toHaveBeenCalledTimes(1);
    const message = io.error.mock.calls[0][0];
    expect(message).toMatch(/Démarrage refusé/);
    expect(message).toContain('- SESSION_SECRET est trop court.');
    expect(message).toContain('- VAPID_PUBLIC_KEY n’est pas valable.');
    expect(message).toMatch(/code 1/);
    expect(io.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('logs before it exits, so the reason is never lost', () => {
    const order: string[] = [];
    refuseIfUnsafe(
      { fatal: ['x'], warnings: [] },
      {
        error: () => void order.push('log'),
        exit: () => {
          order.push('exit');
          return undefined as never;
        },
      },
    );
    expect(order).toEqual(['log', 'exit']);
  });
});

describe('the startup hook', () => {
  // `exit` throws here, as it never returns in real life: the code after it must not run
  const stopsAt = () =>
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

  const mockHeavyModules = () => {
    const readDb = vi.fn(async () => ({}));
    const startJobs = vi.fn();
    vi.doMock('@/server/db', () => ({ readDb }));
    vi.doMock('@/server/jobs', () => ({ startJobs }));
    return { readDb, startJobs };
  };

  it('stops with code 1 and a clear message on a refused configuration, before the database and the jobs', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'not-a-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'not-a-key');
    const exit = stopsAt();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { readDb, startJobs } = mockHeavyModules();

    await expect(import('@/instrumentation.node')).rejects.toThrow('exit:1');

    expect(exit).toHaveBeenCalledWith(1);
    expect(error.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/Démarrage refusé[\s\S]*VAPID_PUBLIC_KEY/);
    expect(readDb).not.toHaveBeenCalled();
    expect(startJobs).not.toHaveBeenCalled();
  });

  it('starts the jobs and does not exit on a sound configuration', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const exit = stopsAt();
    const { startJobs } = mockHeavyModules();

    await import('@/instrumentation.node');

    expect(exit).not.toHaveBeenCalled();
    expect(startJobs).toHaveBeenCalledTimes(1);
  });
});
