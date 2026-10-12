import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useDatabaseOptional } from '@/lib/db/DatabaseContext';
import { getBackupChipState, type BackupChipState } from '@/lib/db/repos/backups';
import { getBackupChipStateAsync } from '@/lib/db/repos/backupsAsync';
import { getIssuerProfile } from '@/lib/db/repos/issuer';
import {
  getLatestIssuedInvoice,
  listDraftDocuments,
  listRecentDocuments,
  type Document,
  type RecentDocument,
} from '@/lib/db/repos/documents';
import { listRecentClients, type Client } from '@/lib/db/repos/clients';
import { formatJapanDisplayDate, todayJapanYmd } from '@/lib/domain/dates';

export type HomeScreenData = {
  businessTitle: string;
  todayLabel: string;
  backup: BackupChipState;
  drafts: Document[];
  recentClients: Client[];
  recentDocuments: RecentDocument[];
  latestInvoice: Document | null;
  isEmpty: boolean;
};

const EMPTY: HomeScreenData = {
  businessTitle: '',
  todayLabel: '',
  backup: {
    kind: 'warning',
    title: '保存先が未設定',
    subtitle: 'この端末を消すと、アプリ内のコピーも消える',
  },
  drafts: [],
  recentClients: [],
  recentDocuments: [],
  latestInvoice: null,
  isEmpty: true,
};

export function useHomeScreen(): HomeScreenData {
  const { db, ready, dataVersion } = useDatabaseOptional();
  const [data, setData] = useState<HomeScreenData>(EMPTY);

  const refresh = useCallback(() => {
    if (!db) {
      return;
    }

    const apply = async () => {
      if (Platform.OS === 'web') {
        const row = await db.getFirstAsync<{ business_name: string }>(
          'SELECT business_name FROM issuer_profile WHERE id = 1',
        );
        const backup = await getBackupChipStateAsync(db);
        const docCount = await db.getFirstAsync<{ c: number }>(
          'SELECT COUNT(*) AS c FROM documents',
        );
        const hasContent = (docCount?.c ?? 0) > 0;

        setData({
          businessTitle: row?.business_name || '（屋号未設定）',
          todayLabel: formatJapanDisplayDate(todayJapanYmd()),
          backup,
          drafts: [],
          recentClients: [],
          recentDocuments: [],
          latestInvoice: null,
          isEmpty: !hasContent,
        });
        return;
      }

      const issuer = getIssuerProfile(db);
      const drafts = listDraftDocuments(db, 3);
      const recentClients = listRecentClients(db, 5);
      const recentDocuments = listRecentDocuments(db, 3);
      const latestInvoice = getLatestIssuedInvoice(db);
      const hasContent =
        recentDocuments.length > 0 ||
        drafts.length > 0 ||
        recentClients.length > 0 ||
        latestInvoice !== null;

      setData({
        businessTitle: issuer?.businessName || '（屋号未設定）',
        todayLabel: formatJapanDisplayDate(todayJapanYmd()),
        backup: getBackupChipState(db),
        drafts,
        recentClients,
        recentDocuments,
        latestInvoice,
        isEmpty: !hasContent,
      });
    };

    void apply();
  }, [db]);

  useEffect(() => {
    if (ready && db) {
      refresh();
    }
  }, [ready, db, dataVersion, refresh]);

  return data;
}
