import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabase, openDatabaseAsync } from './open';
import { runMigrations, type MigrationOutcome } from './migrate';
import { runMigrationsAsync } from './migrateAsync';
import { applyE2EScenario } from '@/lib/e2e/seed';
import { applyE2EScenarioAsync } from '@/lib/e2e/seedAsync';
import { resolveE2EScenario } from '@/lib/e2e/scenario';
import type { E2EScenario } from '@/lib/e2e/seed';

type DbContextValue = {
  db: SQLiteDatabase | null;
  ready: boolean;
  migration: MigrationOutcome | null;
  dataVersion: number;
  e2eScenario: string | null;
};

const DatabaseContext = createContext<DbContextValue>({
  db: null,
  ready: false,
  migration: null,
  dataVersion: 0,
  e2eScenario: null,
});

async function bootstrapDatabase(): Promise<{
  database: SQLiteDatabase;
  outcome: MigrationOutcome;
}> {
  const database = Platform.OS === 'web' ? await openDatabaseAsync() : openDatabase();
  const outcome =
    Platform.OS === 'web' ? await runMigrationsAsync(database) : runMigrations(database);
  return { database, outcome };
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const params = useGlobalSearchParams<{ e2e?: string }>();
  const dbRef = useRef<SQLiteDatabase | null>(null);
  const migrationRef = useRef<MigrationOutcome | null>(null);
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [migration, setMigration] = useState<MigrationOutcome | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [e2eScenario, setE2eScenario] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const publishDb = (
      database: SQLiteDatabase,
      outcome: MigrationOutcome,
      scenario: E2EScenario | null,
    ) => {
      if (cancelled) {
        return;
      }
      dbRef.current = database;
      migrationRef.current = outcome;
      setMigration(outcome);
      setE2eScenario(scenario);
      setDb(database);
      setDataVersion((v) => v + 1);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.__DB_READY__ = true;
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.__INVOICE_E2E__ = {
        seed: async (next: E2EScenario) => {
          const database = dbRef.current;
          if (!database) {
            throw new Error('database not ready');
          }
          await applyE2EScenarioAsync(database, next);
          publishDb(database, migrationRef.current ?? { ok: true, userVersion: 1 }, next);
        },
      };
    }

    void (async () => {
      const { database, outcome } = await bootstrapDatabase();
      if (cancelled) {
        return;
      }

      const scenario = resolveE2EScenario(params.e2e);
      if (scenario && outcome.ok) {
        if (Platform.OS === 'web') {
          await applyE2EScenarioAsync(database, scenario);
        } else {
          applyE2EScenario(database, scenario);
        }
      }

      publishDb(database, outcome, scenario);
    })();

    return () => {
      cancelled = true;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.__DB_READY__ = false;
      }
    };
  }, [params.e2e]);

  const value = useMemo(
    () => ({ db, ready: Boolean(db), migration, dataVersion, e2eScenario }),
    [db, migration, dataVersion, e2eScenario],
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): SQLiteDatabase {
  const { db } = useContext(DatabaseContext);
  if (!db) {
    throw new Error('database not ready');
  }
  return db;
}

export function useDatabaseOptional(): DbContextValue {
  return useContext(DatabaseContext);
}
