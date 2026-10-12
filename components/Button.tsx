import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

type Variant = 'primary' | 'secondary';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', style, testID, disabled }: Props) {
  const colors = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: disabled ? colors.fill : isPrimary ? colors.accent : colors.sheet,
          borderColor: colors.line,
          borderWidth: isPrimary ? 0 : 1,
          opacity: pressed && !disabled ? 0.72 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          typography.bodyBold,
          {
            color: disabled ? colors.inkTertiary : isPrimary ? colors.accentInk : colors.ink,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: spacing.primaryButtonHeight,
    borderRadius: spacing.controlRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
