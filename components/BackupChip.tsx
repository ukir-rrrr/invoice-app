import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';
import type { BackupChipState } from '@/lib/db/repos/backups';

type Props = {
  state: BackupChipState;
  onPress?: () => void;
};

function paletteForState(
  state: BackupChipState,
  colors: ReturnType<typeof useTheme>,
): { bg: string; border: string; badge: string } {
  switch (state.kind) {
    case 'ok':
      return { bg: colors.mossSoft, border: colors.moss, badge: colors.moss };
    case 'stale':
      return { bg: colors.ochreSoft, border: colors.ochre, badge: colors.ochre };
    case 'warning':
    case 'failed':
      return { bg: colors.sealSoft, border: colors.seal, badge: colors.seal };
  }
}

function badgeSymbol(kind: BackupChipState['kind']): string {
  if (kind === 'ok') {
    return '✓';
  }
  if (kind === 'stale') {
    return '◷';
  }
  return '▲';
}

export function BackupChip({ state, onPress }: Props) {
  const colors = useTheme();
  const pal = paletteForState(state, colors);

  return (
    <Pressable
      testID="backup-chip"
      accessibilityRole="button"
      accessibilityLabel={`${state.title}。${state.subtitle}。バックアップを開く`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        {
          backgroundColor: pal.bg,
          borderLeftColor: pal.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: pal.badge }]}>
        <Text style={[styles.badgeText, { color: colors.badgeInk }]}>
          {badgeSymbol(state.kind)}
        </Text>
      </View>
      <View style={styles.textCol}>
        <Text style={[typography.bodyBold, { color: colors.ink }]}>{state.title}</Text>
        <Text style={[typography.meta, { color: colors.inkSecondary }]}>{state.subtitle}</Text>
      </View>
      <Text style={[typography.meta, { color: colors.inkSecondary }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 56,
    borderRadius: spacing.controlRadius,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
});
