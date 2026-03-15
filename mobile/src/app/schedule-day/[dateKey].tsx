import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addHours, format, isSameDay, isValid, startOfDay } from 'date-fns';
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
import { buildScheduleDayMap, parseScheduleEnd, parseScheduleStart, toDateKey } from '@/utils/scheduleCalendar';

const SCHEDULE_TYPES: Array<{ value: ScheduleType; label: string }> = [
  { value: 'es_deadline', label: 'ES締切' },
  { value: 'interview', label: '面接' },
  { value: 'exam', label: '試験' },
  { value: 'event', label: 'イベント' },
];

type PickerField = 'start' | 'end';
type PickerMode = 'date' | 'time';

interface PickerState {
  field: PickerField;
  mode: PickerMode;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return '通信に失敗しました。時間をおいて再試行してください。';
};

const normalizeAllDayRange = (date: Date): { start: Date; end: Date } => {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  return { start, end };
};

const validateRange = (startAt: Date, endAt: Date, isAllDay: boolean): string | null => {
  if (!isValid(startAt) || !isValid(endAt)) {
    return '日時の形式が不正です';
  }

  if (startAt.getTime() < Date.now()) {
    return '開始時刻は現在以降を指定してください';
  }

  if (isAllDay) {
    return null;
  }

  if (endAt.getTime() <= startAt.getTime()) {
    return '終了時刻は開始時刻より後を指定してください';
  }

  if (!isSameDay(startAt, endAt)) {
    return '時間指定の予定は同じ日付内で設定してください';
  }

  return null;
};

const mergeDateTime = (current: Date, selected: Date, mode: PickerMode): Date => {
  const merged = new Date(current);
  if (mode === 'date') {
    merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    return merged;
  }

  merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  return merged;
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

  const targetDate = useMemo(() => getDateFromParam(params.dateKey), [params.dateKey]);
  const targetDayKey = useMemo(() => toDateKey(targetDate), [targetDate]);

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [editType, setEditType] = useState<ScheduleType>('interview');
  const [editTitle, setEditTitle] = useState('');
  const [editStartAt, setEditStartAt] = useState(addHours(new Date(), 1));
  const [editEndAt, setEditEndAt] = useState(addHours(new Date(), 2));
  const [editIsAllDay, setEditIsAllDay] = useState(false);
  const [pickerState, setPickerState] = useState<PickerState | null>(null);

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
      setPickerState(null);
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
      setPickerState(null);
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

  const companies = useMemo<Company[]>(() => companiesQuery.data ?? [], [companiesQuery.data]);
  const schedules = useMemo<Schedule[]>(() => schedulesQuery.data ?? [], [schedulesQuery.data]);

  const schedulesByDay = useMemo(() => buildScheduleDayMap(schedules), [schedules]);

  const daySchedules = useMemo<Schedule[]>(() => schedulesByDay.get(targetDayKey) ?? [], [schedulesByDay, targetDayKey]);

  const isEditPending = updateScheduleMutation.isPending || deleteScheduleMutation.isPending;
  const isRefreshing = schedulesQuery.isRefetching || companiesQuery.isRefetching;

  const handleRefresh = async (): Promise<void> => {
    await Promise.all([schedulesQuery.refetch(), companiesQuery.refetch()]);
  };

  const openEditModal = (schedule: Schedule): void => {
    const start = parseScheduleStart(schedule) ?? addHours(new Date(), 1);
    const end = parseScheduleEnd(schedule) ?? addHours(start, 1);

    setSelectedSchedule(schedule);
    setEditCompanyId(schedule.companyId);
    setEditType(schedule.type);
    setEditTitle(schedule.title);
    setEditStartAt(start);
    setEditEndAt(end);
    setEditIsAllDay(schedule.isAllDay);
    setPickerState(null);
    setIsEditModalVisible(true);
  };

  const closeEditModal = (): void => {
    if (isEditPending) {
      return;
    }

    setIsEditModalVisible(false);
    setSelectedSchedule(null);
    setPickerState(null);
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

    const allDayRange = normalizeAllDayRange(editStartAt);
    const startAt = editIsAllDay ? allDayRange.start : editStartAt;
    const endAt = editIsAllDay ? allDayRange.end : editEndAt;

    const validationError = validateRange(startAt, endAt, editIsAllDay);
    if (validationError) {
      Alert.alert('入力エラー', validationError);
      return;
    }

    await updateScheduleMutation.mutateAsync({
      id: selectedSchedule.id,
      payload: {
        type: editType,
        title: trimmedTitle,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        isAllDay: editIsAllDay,
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

  const handleToggleAllDay = (value: boolean): void => {
    setEditIsAllDay(value);
    if (value) {
      const normalized = normalizeAllDayRange(editStartAt);
      setEditStartAt(normalized.start);
      setEditEndAt(normalized.end);
      return;
    }

    if (editEndAt.getTime() <= editStartAt.getTime() || !isSameDay(editStartAt, editEndAt)) {
      setEditEndAt(addHours(editStartAt, 1));
    }
  };

  const openPicker = (field: PickerField, mode: PickerMode): void => {
    setPickerState({ field, mode });
  };

  const getPickerValue = (): Date => {
    if (!pickerState) {
      return editStartAt;
    }

    return pickerState.field === 'start' ? editStartAt : editEndAt;
  };

  const handlePickerChange = (event: DateTimePickerEvent, selected?: Date): void => {
    const activePicker = pickerState;
    if (!activePicker) {
      return;
    }

    if (event.type === 'dismissed' || !selected) {
      setPickerState(null);
      return;
    }

    const current = activePicker.field === 'start' ? editStartAt : editEndAt;
    const merged = mergeDateTime(current, selected, activePicker.mode);

    if (activePicker.field === 'start') {
      if (editIsAllDay) {
        const normalized = normalizeAllDayRange(merged);
        setEditStartAt(normalized.start);
        setEditEndAt(normalized.end);
      } else {
        setEditStartAt(merged);
        if (merged.getTime() >= editEndAt.getTime()) {
          setEditEndAt(addHours(merged, 1));
        }
      }
    } else {
      setEditEndAt(merged);
    }

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      setPickerState(null);
    }
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
                const start = parseScheduleStart(schedule);
                const end = parseScheduleEnd(schedule);
                const timeLabel = schedule.isAllDay
                  ? '終日'
                  : start && end
                    ? `${format(start, 'HH:mm')}-${format(end, 'HH:mm')}`
                    : '--:--';
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

                <View style={styles.toggleRow}>
                  <Text style={styles.fieldLabel}>終日</Text>
                  <Switch
                    value={editIsAllDay}
                    onValueChange={handleToggleAllDay}
                    disabled={isEditPending}
                    trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
                    thumbColor={editIsAllDay ? colors.primary : '#FFFFFF'}
                  />
                </View>

                <View style={styles.selectorGroup}>
                  <Text style={styles.fieldLabel}>開始</Text>
                  <View style={styles.selectorRow}>
                    <Pressable
                      style={[styles.selectorButton, isEditPending && styles.selectorButtonDisabled]}
                      onPress={() => openPicker('start', 'date')}
                      disabled={isEditPending}
                    >
                      <Text style={styles.selectorButtonText}>{format(editStartAt, 'yyyy-MM-dd')}</Text>
                    </Pressable>
                    {!editIsAllDay ? (
                      <Pressable
                        style={[styles.selectorButton, isEditPending && styles.selectorButtonDisabled]}
                        onPress={() => openPicker('start', 'time')}
                        disabled={isEditPending}
                      >
                        <Text style={styles.selectorButtonText}>{format(editStartAt, 'HH:mm')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {!editIsAllDay ? (
                  <View style={styles.selectorGroup}>
                    <Text style={styles.fieldLabel}>終了</Text>
                    <View style={styles.selectorRow}>
                      <Pressable
                        style={[styles.selectorButton, isEditPending && styles.selectorButtonDisabled]}
                        onPress={() => openPicker('end', 'date')}
                        disabled={isEditPending}
                      >
                        <Text style={styles.selectorButtonText}>{format(editEndAt, 'yyyy-MM-dd')}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.selectorButton, isEditPending && styles.selectorButtonDisabled]}
                        onPress={() => openPicker('end', 'time')}
                        disabled={isEditPending}
                      >
                        <Text style={styles.selectorButtonText}>{format(editEndAt, 'HH:mm')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.helperText}>終日予定は選択日の00:00-24:00として保存されます</Text>
                )}

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

      {pickerState ? (
        <DateTimePicker
          mode={pickerState.mode}
          value={getPickerValue()}
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handlePickerChange}
        />
      ) : null}
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
    width: 72,
    fontSize: 15,
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
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  flexButton: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorGroup: {
    gap: 6,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  selectorButtonDisabled: {
    opacity: 0.6,
  },
  selectorButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  helperText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 6,
  },
});
