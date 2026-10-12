import { Platform } from 'react-native';
import type { E2EScenario } from './seed';

export function parseE2EScenario(value: string | string[] | undefined): E2EScenario | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'empty' || raw === 'normal' || raw === 'backup-warning') {
    return raw;
  }
  return null;
}

declare global {
  interface Window {
    __E2E_SCENARIO__?: string;
    __INVOICE_E2E__?: {
      seed: (scenario: E2EScenario) => Promise<void>;
    };
    __DB_READY__?: boolean;
  }
}

export function readE2EScenarioFromUrl(): E2EScenario | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  const injected = parseE2EScenario(window.__E2E_SCENARIO__);
  if (injected) {
    return injected;
  }
  try {
    const stored = window.localStorage.getItem('e2e-scenario');
    const fromStorage = parseE2EScenario(stored ?? undefined);
    if (fromStorage) {
      return fromStorage;
    }
  } catch {
    // localStorage unavailable
  }
  const e2e = new URLSearchParams(window.location.search).get('e2e');
  return parseE2EScenario(e2e ?? undefined);
}

export function resolveE2EScenario(routerParam?: string | string[]): E2EScenario | null {
  const fromRouter = parseE2EScenario(routerParam);
  if (fromRouter) {
    return fromRouter;
  }
  const fromUrl = readE2EScenarioFromUrl();
  if (fromUrl) {
    return fromUrl;
  }
  const fromEnv = process.env.EXPO_PUBLIC_E2E_SCENARIO;
  if (
    process.env.EXPO_PUBLIC_E2E === '1' &&
    (fromEnv === 'empty' || fromEnv === 'normal' || fromEnv === 'backup-warning')
  ) {
    return fromEnv;
  }
  return null;
}
