import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';
import { spacing } from '@/theme/spacing';

export default function ClientsScreen() {
  const colors = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]}>
      <View style={styles.pad}>
        <Text style={[typography.title, { color: colors.ink }]}>取引先</Text>
        <Text style={[typography.body, { color: colors.inkSecondary, marginTop: 8 }]}>
          取引先は、請求の宛先から追加できます。
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pad: { paddingHorizontal: spacing.screenHorizontal, paddingTop: 8 },
});
