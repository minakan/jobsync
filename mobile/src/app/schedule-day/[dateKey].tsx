import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addHours, format, isValid, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { router, useLocalSearchParams } from 'expo-router';

import { companyQueryKeys, fetchCompanies } from '@/api/companies';
import {
  deleteSchedule,
  fetchSchedules,
  scheduleQueryKeys,
  updateSchedule,
} from '@/api/schedules';
import { SCHEDULE_TYPE_META } from '@/components/schedule/scheduleTypeMeta';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, radius, spacing } from '@/theme/tokens';
import { type Company } from '@/types/company';
import { type Schedule, type ScheduleType } from '@/types/schedule';
import { buildScheduleDayMap, parseScheduleDate, toDateKey } from '@/utils/scheduleCalendar';

const SCHEDULE_TYPES: Array<{ value: ScheduleType; label: string }> = [
  { value: 'es_deadline', label: 'ES締切' },
  { value: 'interview', label: '面接' },
  { value: 'exam', label: '試験' },
  { value: 'event', label: 'イベント' },
];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return '通信に失敗しました。時間をおいて再試行してください。';
};

const getDefaultDateTimeInput = (): { date: string; time: string } => {
  const base = addHours(new Date(), 1);

  return {
    date: format(base, 'yyyy-MM-dd'),
    time: format(base, 'HH:mm'),
  };
};

const getDateTimeInputFromSchedule = (scheduledAt: string): { date: string; time: string } => {
  const parsed = parseScheduleDate(scheduledAt);
  if (!parsed) {
    return getDefaultDateTimeInput();
  }

  return {
    date: format(parsed, 'yyyy-MM-dd'),
    time: format(parsed, 'HH:mm'),
  };
};

const getDateFromParam = (dateKey: string | string[] | undefined): Date => {
  const raw = Array.isArray(dateKey) ? dateKey[0] : dateKey;
  if (!raw) {
    return startOfDay(new Date());
  }

  const parsed = new Date(`${raw}T00:00:00`);
  if (!isValid(parsed)) {
    return startOfDay(new Date());
  }

  return startOfDay(parsed);
};

export default function ScheduleDayDetailScreen() {
  const params = useLocalSearchParams<{ dateKey?: string | string[] }>();
  const queryClient = useQueryClient();
  const defaultDateTime = useMemo(() => getDefaultDateTimeInput(), []);

  const targetDate = useMemo(() => getDateFromParam(params.dateKey), [params.dateKey]);
  const targetDayKey = useMemo(() => toDateKey(targetDate), [targetDate]);

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [editType, setEditType] = useState<ScheduleType>('interview');
  const [editTitle, setEditTitle] = useState('');
  const [editDateInput, setEditDateInput] = useState(defaultDateTime.date);
  const [editTimeInput, setEditTimeInput] = useState(defaultDateTime.time);

  const schedulesQuery = useQuery({
    queryKey: scheduleQueryKeys.all,
    queryFn: fetchSchedules,
  });

  const companiesQuery = useQuery({
    queryKey: companyQueryKeys.all,
    queryFn: fetchCompanies,
  });

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateSchedule>[1] }) =>
      updateSchedule(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all });
      setSelectedSchedule(null);
      setIsEditModalVisible(false);
    },
    onError: (error: unknown) => {
      Alert.alert('スケジュール更新エラー', getErrorMessage(error));
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all });
      setSelectedSchedule(null);
      setIsEditModalVisible(false);
    },
    onError: (error: unknown) => {
      Alert.alert('スケジュール削除エラー', getErrorMessage(error));
    },
  });

  useEffect(() => {
    if (schedulesQuery.isError) {
      Alert.alert('スケジュール取得エラー', getErrorMessage(schedulesQuery.error));
    }
  }, [schedulesQuery.error, schedulesQuery.isError]);

  useEffect(() => {
    if (companiesQuery.isError) {
      Alert.alert('企業取得エラー', getErrorMessage(companiesQuery.error));
    }
  }, [companiesQuery.error, companiesQuery.isError]);

  const companies = useMemo<Company[]>(() => {
    return companiesQuery.data ?? [];
  }, [companiesQuery.data]);

  const schedules = useMemo<Schedule[]>(() => {
    return schedulesQuery.data ?? [];
  }, [schedulesQuery.data]);

  const schedulesByDay = useMemo(() => {
    return buildScheduleDayMap(schedules);
  }, [schedules]);

  const daySchedules = useMemo<Schedule[]>(() => {
    return schedulesByDay.get(targetDayKey) ?? [];
  }, [schedulesByDay, targetDayKey]);

  const isEditPending = updateScheduleMutation.isPending || deleteScheduleMutation.isPending;
  const isRefreshing = schedulesQuery.isRefetching || companiesQuery.isRefetching;

  const handleRefresh = async (): Promise<void> => {
    await Promise.all([schedulesQuery.refetch(), companiesQuery.refetch()]);
  };

  const openEditModal = (schedule: Schedule): void => {
    const nextDateTime = getDateTimeInputFromSchedule(schedule.scheduledAt);

    setSelectedSchedule(schedule);
    setEditCompanyId(schedule.companyId);
    setEditType(schedule.type);
    setEditTitle(schedule.title);
    setEditDateInput(nextDateTime.date);
    setEditTimeInput(nextDateTime.time);
    setIsEditModalVisible(true);
  };

  const closeEditModal = (): void => {
    if (isEditPending) {
      return;
    }

    setIsEditModalVisible(false);
    setSelectedSchedule(null);
  };

  const handleUpdateSchedule = async (): Promise<void> => {
    if (!selectedSchedule) {
      return;
    }

    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('入力エラー', 'タイトルを入力してください');
      return;
    }

    const parsedDate = new Date(`${editDateInput}T${editTimeInput}:00`);
    if (!isValid(parsedDate)) {
      Alert.alert('入力エラー', '日時の形式が不正です');
      return;
    }

    await updateScheduleMutation.mutateAsync({
      id: selectedSchedule.id,
      payload: {
        type: editType,
        title: trimmedTitle,
        scheduledAt: parsedDate.toISOString(),
        ...(editCompanyId ? { companyId: editCompanyId } : {}),
      },
    });
  };

  const handleDeleteSchedule = (): void => {
    if (!selectedSchedule || deleteScheduleMutation.isPending) {
      return;
    }

    Alert.alert('スケジュール削除', 'この予定を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          if (!selectedSchedule) {
            return;
          }

          deleteScheduleMutation.mutate(selectedSchedule.id);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerWrap}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonLabel}>戻る</Text>
        </Pressable>
        <SectionHeader
          title={format(targetDate, 'M月d日(E)', { locale: ja })}
          subtitle="予定を時系列で確認（長押しで編集）"
        />
      </View>

      {schedulesQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>予定を読み込み中...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
        >
          {daySchedules.length === 0 ? (
            <AppCard>
              <EmptyState
                title="この日の予定はありません"
                description="月カレンダーに戻って別の日を選択するか、予定を追加してください。"
              />
            </AppCard>
          ) : (
            <View style={styles.timelineList}>
              {daySchedules.map((schedule) => {
                const parsedDate = parseScheduleDate(schedule.scheduledAt);
                const timeLabel = parsedDate ? format(parsedDate, 'HH:mm') : '--:--';
                const typeMeta = SCHEDULE_TYPE_META[schedule.type];

                return (
                  <Pressable
                    key={schedule.id}
                    style={styles.timelineRow}
                    onLongPress={() => openEditModal(schedule)}
                    delayLongPress={280}
                  >
                    {({ pressed }) => (
                      <View style={[styles.timelineCard, pressed && styles.pressed]}>
                        <Text style={styles.timeLabel}>{timeLabel}</Text>
                        <View style={styles.timelineBody}>
                          <View style={styles.titleRow}>
                            <Text style={styles.titleText} numberOfLines={1}>
                              {schedule.title}
                            </Text>
                            <View style={[styles.typeBadge, { backgroundColor: typeMeta.soft }]}>
                              <Text style={[styles.typeLabel, { color: typeMeta.color }]}>{typeMeta.label}</Text>
                            </View>
                          </View>
                          <Text style={styles.metaText} numberOfLines={1}>
                            {schedule.companyName}
                          </Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={isEditModalVisible} transparent animationType="slide" onRequestClose={closeEditModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <SectionHeader title="スケジュールを編集" subtitle="内容を更新または削除できます" />

            {selectedSchedule ? (
              <ScrollView contentContainerStyle={styles.detailContent}>
                <Text style={styles.fieldLabel}>企業</Text>
                <ScrollView style={styles.companyScrollArea}>
                  <View style={styles.companyOptions}>
                    {companies.map((company) => {
                      const isSelected = editCompanyId === company.id;

                      return (
                        <Pressable
                          key={company.id}
                          style={[styles.chip, isSelected && styles.chipSelected]}
                          onPress={() => setEditCompanyId(company.id)}
                          disabled={isEditPending}
                        >
                          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]} numberOfLines={1}>
                            {company.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                <Text style={styles.fieldLabel}>種類</Text>
                <View style={styles.typeOptions}>
                  {SCHEDULE_TYPES.map((type) => {
                    const isSelected = editType === type.value;

                    return (
                      <Pressable
                        key={type.value}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => setEditType(type.value)}
                        disabled={isEditPending}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{type.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>タイトル</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="例: 一次面接"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  editable={!isEditPending}
                />

                <Text style={styles.fieldLabel}>日時</Text>
                <View style={styles.dateTimeRow}>
                  <TextInput
                    value={editDateInput}
                    onChangeText={setEditDateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, styles.dateInput]}
                    editable={!isEditPending}
                  />
                  <TextInput
                    value={editTimeInput}
                    onChangeText={setEditTimeInput}
                    placeholder="HH:mm"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, styles.timeInput]}
                    editable={!isEditPending}
                  />
                </View>

                <View style={styles.modalActions}>
                  <AppButton
                    label="閉じる"
                    variant="secondary"
                    onPress={closeEditModal}
                    disabled={isEditPending}
                    style={styles.flexButton}
                  />
                  <AppButton
                    label="保存"
                    onPress={() => {
                      void handleUpdateSchedule();
                    }}
                    loading={updateScheduleMutation.isPending}
                    disabled={isEditPending}
                    style={styles.flexButton}
                  />
                </View>

                <AppButton
                  label="スケジュールを削除"
                  variant="danger"
                  onPress={handleDeleteSchedule}
                  loading={deleteScheduleMutation.isPending}
                  disabled={isEditPending}
                />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backButtonLabel: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 36,
    flexGrow: 1,
  },
  timelineList: {
    gap: spacing.sm,
  },
  timelineRow: {
    borderRadius: radius.md,
  },
  timelineCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pressed: {
    opacity: 0.86,
  },
  timeLabel: {
    width: 46,
    fontSize: 18,
    fontWeight: '800',
    color: colors.primaryStrong,
    lineHeight: 22,
  },
  timelineBody: {
    flex: 1,
    gap: 5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  typeBadge: {
    borderRadius: radius.round,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.subtext,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    gap: 12,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  detailContent: {
    gap: 12,
    paddingBottom: 8,
  },
  fieldLabel: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '700',
  },
  companyScrollArea: {
    maxHeight: 150,
  },
  companyOptions: {
    gap: 8,
  },
  typeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.primaryStrong,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateInput: {
    flex: 2,
  },
  timeInput: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  flexButton: {
    flex: 1,
  },
});
