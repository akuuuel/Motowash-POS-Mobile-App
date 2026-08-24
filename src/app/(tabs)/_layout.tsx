import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3B82F6', // Blue accent color
        tabBarInactiveTintColor: isDark ? '#64748B' : '#94A3B8',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: isDark ? '#1E293B' : '#E2E8F0',
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        headerStyle: {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: isDark ? '#0F172A' : '#E2E8F0',
        },
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 19,
          color: isDark ? '#F1F5F9' : '#1E293B',
        },
        headerTintColor: isDark ? '#F1F5F9' : '#1E293B',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          headerTitle: 'Koko Motowash',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transaksi',
          headerTitle: 'Transaksi Pencucian',
          tabBarLabel: 'Transaksi',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Laporan',
          headerTitle: 'Laporan & Ekspor',
          tabBarLabel: 'Laporan',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Pengaturan',
          headerTitle: 'Kelola & Setelan',
          tabBarLabel: 'Pengaturan',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
