import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { format, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { STATUS_CONFIG } from '@/components/company/StatusBadge';
import { ScheduleCard } from '@/components/schedule/ScheduleCard';
import { CountdownTimer } from '@/components/schedule/CountdownTimer';
import { useHomeData } from '@/hooks/useHomeData';
import { useAuthStore } from '@/stores/authStore';
import { CompanyStatus } from '@/types/company';
import { colors, radius, shadow, spacing, typography } from '@/theme/tokens';

const SkeletonLoader = () => {
  return (
    <View style={styles.skeletonContainer}>
      <View style={[styles.skeletonLineLarge, { backgroundColor: colors.skeleton }]} />
      <View style={[styles.skeletonLineMedium, { backgroundColor: colors.skeleton }]} />
      <View style={[styles.skeletonCard, { backgroundColor: colors.skeleton }]} />
      <View style={[styles.skeletonCard, { backgroundColor: colors.skeleton }]} />
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
  const [refreshing, setRefreshing] = useState(false);

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

  const displayName = user?.name ?? '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Animated.View entering={FadeIn.duration(320)} style={styles.headerArea}>
          <Text style={styles.greeting}>おかえりなさい{displayName ? `、${displayName}` : ''}</Text>
          <Text style={styles.todayText}>{todayLabel}</Text>

          <AppCard style={styles.heroCard}>
            <Text style={styles.heroTitle}>今日の進捗をすぐ確認</Text>
            <Text style={styles.heroCaption}>予定、締切、選考状況をこの画面でまとめて把握できます。</Text>
          </AppCard>
        </Animated.View>

        {isLoading ? (
          <SkeletonLoader />
        ) : (
          <>
            <Animated.View entering={FadeIn.duration(420)} style={styles.sectionBlock}>
              <SectionHeader title="今日の予定" subtitle="本日予定されているイベント" />
              <FlatList
                data={todaySchedules}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <ScheduleCard schedule={item} />}
                ItemSeparatorComponent={() => <View style={styles.listGap} />}
                scrollEnabled={false}
                ListEmptyComponent={
                  <AppCard>
                    <EmptyState title="今日の予定はありません" description="予定を追加するとここに表示されます。" />
                  </AppCard>
                }
              />
            </Animated.View>

            <Animated.View entering={FadeIn.duration(500)} style={styles.sectionBlock}>
              <SectionHeader title="直近の締切" subtitle="72時間以内のES締切" />

              <FlatList
                data={upcomingDeadlines}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const deadlineStart = parseISO(item.startAt || item.scheduledAt);
                  const deadlineEnd = parseISO(item.endAt || item.startAt || item.scheduledAt);
                  const dateLabel = item.isAllDay
                    ? isValid(deadlineStart)
                      ? format(deadlineStart, 'M月d日(E) 終日', { locale: ja })
                      : '日時が不正です'
                    : isValid(deadlineStart) && isValid(deadlineEnd)
                      ? `${format(deadlineStart, 'M月d日(E) HH:mm', { locale: ja })} - ${format(deadlineEnd, 'HH:mm', {
                          locale: ja,
                        })}`
                      : '日時が不正です';

                  return (
                    <AppCard>
                      <View style={styles.deadlineHeader}>
                        <Text style={styles.deadlineCompany} numberOfLines={1}>
                          {item.companyName}
                        </Text>
                        <CountdownTimer scheduledAt={item.isAllDay ? item.endAt : item.startAt} />
                      </View>
                      <Text style={styles.deadlineTitle}>{item.title}</Text>
                      <Text style={styles.deadlineDate}>{dateLabel}</Text>
                    </AppCard>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.listGap} />}
                scrollEnabled={false}
                ListEmptyComponent={
                  <AppCard>
                    <EmptyState
                      title="3日以内の締切はありません"
                      description="余裕のある今のうちに次の選考を確認しましょう。"
                    />
                  </AppCard>
                }
              />
            </Animated.View>

            <Animated.View entering={FadeIn.duration(580)} style={styles.sectionBlock}>
              <SectionHeader title="選考中の企業サマリー" subtitle="ステータスごとの件数" />
              {summaryEntries.length > 0 ? (
                <View style={styles.summaryGrid}>
                  {summaryEntries.map(([status, count]) => (
                    <AppCard key={status} style={styles.summaryCard}>
                      <Text style={styles.summaryCount}>{count}</Text>
                      <Text style={styles.summaryLabel}>{statusLabelFor(status)}</Text>
                    </AppCard>
                  ))}
                </View>
              ) : (
                <AppCard>
                  <EmptyState
                    title="集計できる企業データがありません"
                    description="企業を追加するとステータス集計が表示されます。"
                  />
                </AppCard>
              )}
            </Animated.View>
          </>
        )}
      </ScrollView>

      <View style={styles.fabWrap}>
        <AppButton
          label={isSyncing ? '同期中...' : 'メールを同期'}
          onPress={() => {
            void triggerSync();
          }}
          loading={isSyncing}
          style={styles.fabButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 124,
    gap: 22,
  },
  headerArea: {
    gap: 8,
  },
  greeting: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  todayText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  heroCard: {
    marginTop: 6,
    backgroundColor: '#EFF6FF',
    borderColor: colors.primaryBorder,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  heroCaption: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  sectionBlock: {
    gap: 10,
  },
  listGap: {
    height: 10,
  },
  deadlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  deadlineCompany: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  deadlineTitle: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  deadlineDate: {
    color: colors.muted,
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
    gap: 4,
  },
  summaryCount: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  summaryLabel: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  fabWrap: {
    position: 'absolute',
    right: 16,
    bottom: 22,
  },
  fabButton: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.round,
    ...shadow.floating,
  },
  skeletonContainer: {
    gap: 12,
  },
  skeletonLineLarge: {
    width: '62%',
    height: 30,
    borderRadius: 9,
  },
  skeletonLineMedium: {
    width: '45%',
    height: 14,
    borderRadius: 7,
  },
  skeletonCard: {
    width: '100%',
    height: 92,
    borderRadius: radius.md,
  },
});
