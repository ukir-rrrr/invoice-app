import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackupChip } from '@/components/BackupChip';
import { Button } from '@/components/Button';
import { useHomeScreen } from '@/hooks/useHomeScreen';
import { useDatabaseOptional } from '@/lib/db/DatabaseContext';
import { formatYen } from '@/lib/format/yen';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

export default function HomeScreen() {
  const colors = useTheme();
  const { e2eScenario } = useDatabaseOptional();
  const home = useHomeScreen();

  return (
    <SafeAreaView
      testID="home-screen"
      style={[styles.safe, { backgroundColor: colors.paper }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text testID="e2e-scenario" style={{ height: 0, width: 0, opacity: 0 }}>
          {e2eScenario ?? 'none'}
        </Text>
        <Text testID="home-business-name" style={[typography.screen, { color: colors.ink }]}>
          {home.businessTitle}
        </Text>
        <Text style={[typography.meta, { color: colors.inkSecondary }]}>{home.todayLabel}</Text>

        <BackupChip state={home.backup} />

        <View style={styles.actions}>
          <Button testID="create-invoice-button" label="請求書を作る" style={styles.primaryFlex} />
          <Button
            testID="create-quote-button"
            label="見積"
            variant="secondary"
            style={styles.quoteButton}
          />
        </View>

        {home.latestInvoice ? (
          <Button
            testID="repeat-last-button"
            label="前回と同じ"
            variant="secondary"
            style={styles.repeatButton}
          />
        ) : null}

        {!home.isEmpty ? (
          <>
            {home.drafts.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={[typography.caption, styles.sectionTitle, { color: colors.inkSecondary }]}
                >
                  続きから
                </Text>
                {home.drafts.map((d) => (
                  <View key={d.id} style={[styles.row, { borderBottomColor: colors.line }]}>
                    <Text style={[typography.bodyBold, { color: colors.ink, flex: 1 }]}>
                      {d.title || '（件名なし）'}
                    </Text>
                    <Text style={[typography.meta, { color: colors.inkSecondary }]}>
                      {formatYen(d.totalYen)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {home.recentClients.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={[typography.caption, styles.sectionTitle, { color: colors.inkSecondary }]}
                >
                  最近の取引先
                </Text>
                <View style={styles.chips}>
                  {home.recentClients.map((c) => (
                    <View
                      key={c.id}
                      style={[
                        styles.chip,
                        { borderColor: colors.line, backgroundColor: colors.sheet },
                      ]}
                    >
                      <Text style={[typography.meta, { color: colors.ink }]}>{c.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {home.recentDocuments.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={[typography.caption, styles.sectionTitle, { color: colors.inkSecondary }]}
                >
                  最近の書類
                </Text>
                {home.recentDocuments.map((doc) => (
                  <View key={doc.id} style={[styles.row, { borderBottomColor: colors.line }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodyBold, { color: colors.ink }]}>
                        {doc.displayClient}
                      </Text>
                      <Text style={[typography.meta, { color: colors.inkSecondary }]}>
                        {doc.docNo ?? '番号なし'}
                      </Text>
                    </View>
                    <Text style={[typography.bodyBold, { color: colors.ink }]}>
                      {formatYen(doc.totalYen)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text
            testID="home-empty-message"
            style={[typography.body, styles.emptyText, { color: colors.ink }]}
          >
            データはこの端末の中にあります。{'\n'}
            バックアップファイルを自分のフォルダに残します。
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: spacing.footerBottom,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  primaryFlex: { flex: 1 },
  quoteButton: { width: 96 },
  repeatButton: { marginTop: 8 },
  section: { marginTop: spacing.section },
  sectionTitle: { fontWeight: '700', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: spacing.rowMinHeight,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: spacing.chipRadius,
    borderWidth: 1,
    justifyContent: 'center',
  },
  emptyText: { marginTop: spacing.section, lineHeight: 24 },
});
