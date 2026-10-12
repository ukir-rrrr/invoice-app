import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';

import { DatabaseProvider } from '@/lib/db/DatabaseContext';
import { useTheme } from '@/theme/useTheme';
import { typography } from '@/theme/typography';
function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  const colors = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      {focused ? (
        <View
          style={{
            position: 'absolute',
            top: -8,
            width: 16,
            height: 3,
            borderRadius: 2,
            backgroundColor: colors.accent,
          }}
        />
      ) : null}
      <Text
        style={[
          typography.tab,
          {
            color: focused ? colors.accent : colors.inkSecondary,
            fontWeight: focused ? '700' : '400',
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const colors = useTheme();

  return (
    <DatabaseProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            height: 83,
            paddingTop: 8,
            paddingBottom: 28,
            borderTopColor: colors.line,
            backgroundColor: colors.paper,
          },
          tabBarShowLabel: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'ホーム',
            tabBarLabel: ({ focused }) => <TabLabel label="ホーム" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="documents"
          options={{
            title: '書類',
            tabBarLabel: ({ focused }) => <TabLabel label="書類" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="clients"
          options={{
            title: '取引先',
            tabBarLabel: ({ focused }) => <TabLabel label="取引先" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: '設定',
            tabBarLabel: ({ focused }) => <TabLabel label="設定" focused={focused} />,
          }}
        />
      </Tabs>
    </DatabaseProvider>
  );
}
