import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
        }}
      />
      <Tabs.Screen
        name="companies"
        options={{
          title: '企業',
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: '予定',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
        }}
      />
    </Tabs>
  );
}
