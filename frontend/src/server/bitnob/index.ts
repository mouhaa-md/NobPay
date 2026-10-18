import type { GatewayMode } from '@/lib/types';
import { getConfig } from '../config';
import { sandboxGateway } from './client';
import { mockGateway } from './mock';
import type { Gateway } from './types';

export { GatewayError } from './types';
export type { Gateway } from './types';

/** The gateway matching the configured mode, or the mock when a demo fallback is explicitly requested. */
export function getGateway(forceMock = false): Gateway {
  if (forceMock) return mockGateway;
  return getConfig().mode === 'sandbox' ? sandboxGateway : mockGateway;
}

export function gatewayFor(mode: GatewayMode): Gateway {
  return mode === 'sandbox' ? sandboxGateway : mockGateway;
}
