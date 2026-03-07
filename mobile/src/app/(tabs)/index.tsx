import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { format, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

import { STATUS_CONFIG } from '../../components/company/StatusBadge';
import { ScheduleCard } from '../../components/schedule/ScheduleCard';
import { CountdownTimer } from '../../components/schedule/CountdownTimer';
import { useHomeData } from '../../hooks/useHomeData';
import { useAuthStore } from '../../stores/authStore';
import { CompanyStatus } from '../../types/company';

const SkeletonLoader = ({ isDarkMode }: { isDarkMode: boolean }) => {
  const lineColor = isDarkMode ? '#374151' : '#E5E7EB';

  return (
    <View style={styles.skeletonContainer}>
      <View style={[styles.skeletonLineLarge, { backgroundColor: lineColor }]} />
      <View style={[styles.skeletonLineMedium, { backgroundColor: lineColor }]} />
      <View style={[styles.skeletonCard, { backgroundColor: lineColor }]} />
      <View style={[styles.skeletonCard, { backgroundColor: lineColor }]} />
    </View>
  );
};

const statusLabelFor = (status: string): string => {
  if (status in STATUS_CONFIG) {
    return STATUS_CONFIG[status as CompanyStatus].label;
  }

  return status;
};

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const user = useAuthStore((state) => state.user);
  const {
    todaySchedules,
    upcomingDeadlines,
    companySummary,
    isSyncing,
    triggerSync,
    isLoading,
    isRefreshing,
    refreshHomeData,
  } = useHomeData();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await refreshHomeData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshHomeData]);

  const todayLabel = useMemo(() => {
    return format(new Date(), 'M月d日(E)', { locale: ja });
  }, []);

  const summaryEntries = useMemo(() => {
    return Object.entries(companySummary).sort((left, right) => right[1] - left[1]);
  }, [companySummary]);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDarkMode ? '#030712' : '#F9FAFB' },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isRefreshing}
            onRefresh={onRefresh}
            tintColor={isDarkMode ? '#F9FAFB' : '#111827'}
          />
        }
      >
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <Text style={[styles.greeting, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>
            おはよう{user?.name ? ` ${user.name}` : ''}
          </Text>
          <Text style={[styles.todayText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
            {todayLabel}
          </Text>
        </Animated.View>

        {isLoading ? (
          <SkeletonLoader isDarkMode={isDarkMode} />
        ) : (
          <>
            <Animated.View entering={FadeIn.duration(500)} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>
                今日の予定
              </Text>
              <FlatList
                data={todaySchedules}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <ScheduleCard schedule={item} />}
                ItemSeparatorComponent={() => <View style={styles.listGap} />}
                scrollEnabled={false}
                ListEmptyComponent={
                  <Text style={[styles.emptyText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                    今日の予定はありません
                  </Text>
                }
              />
            </Animated.View>

            <Animated.View entering={FadeIn.duration(600)} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>
                直近の締切
              </Text>
              <FlatList
                data={upcomingDeadlines}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const deadline = parseISO(item.scheduledAt);

                  return (
                    <View
                      style={[
                        styles.deadlineCard,
                        {
                          backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
                          borderColor: isDarkMode ? '#374151' : '#E5E7EB',
                        },
                      ]}
                    >
                      <View style={styles.deadlineHeader}>
                        <Text
                          style={[styles.deadlineCompany, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}
                          numberOfLines={1}
                        >
                          {item.companyName}
                        </Text>
                        <CountdownTimer scheduledAt={item.scheduledAt} />
                      </View>
                      <Text style={[styles.deadlineTitle, { color: isDarkMode ? '#D1D5DB' : '#374151' }]}>
                        {item.title}
                      </Text>
                      <Text style={[styles.deadlineDate, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                        {isValid(deadline)
                          ? format(deadline, 'M月d日(E) HH:mm', { locale: ja })
                          : '日時が不正です'}
                      </Text>
                    </View>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.listGap} />}
                scrollEnabled={false}
                ListEmptyComponent={
                  <Text style={[styles.emptyText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                    3日以内の締切はありません
                  </Text>
                }
              />
            </Animated.View>

            <Animated.View entering={FadeIn.duration(700)} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>
                選考中の企業サマリー
              </Text>
              {summaryEntries.length > 0 ? (
                <View style={styles.summaryGrid}>
                  {summaryEntries.map(([status, count]) => (
                    <View
                      key={status}
                      style={[
                        styles.summaryCard,
                        {
                          backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
                          borderColor: isDarkMode ? '#374151' : '#E5E7EB',
                        },
                      ]}
                    >
                      <Text style={[styles.summaryCount, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>
                        {count}
                      </Text>
                      <Text style={[styles.summaryLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                        {statusLabelFor(status)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.emptyText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  集計できる企業データがありません
                </Text>
              )}
            </Animated.View>
          </>
        )}
      </ScrollView>

      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: isSyncing ? '#9CA3AF' : '#2563EB',
            shadowColor: isDarkMode ? '#000000' : '#1F2937',
          },
        ]}
        onPress={triggerSync}
        disabled={isSyncing}
      >
        <Text style={styles.fabLabel}>{isSyncing ? '同期中...' : 'メールを同期'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 120,
    gap: 20,
  },
  header: {
    gap: 4,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
  },
  todayText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
  },
  listGap: {
    height: 10,
  },
  deadlineCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  deadlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  deadlineCompany: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  deadlineTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  deadlineDate: {
    fontSize: 13,
    fontWeight: '500',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  summaryCount: {
    fontSize: 24,
    fontWeight: '800',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  skeletonContainer: {
    gap: 12,
  },
  skeletonLineLarge: {
    width: '60%',
    height: 28,
    borderRadius: 8,
  },
  skeletonLineMedium: {
    width: '40%',
    height: 14,
    borderRadius: 7,
  },
  skeletonCard: {
    width: '100%',
    height: 92,
    borderRadius: 12,
  },
});
