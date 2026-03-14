import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addHours, addMonths, addWeeks, format, isSameDay, isValid, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { router } from 'expo-router';

import { companyQueryKeys, fetchCompanies } from '../../api/companies';
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  scheduleQueryKeys,
  updateSchedule,
} from '../../api/schedules';
import { DayAgenda } from '@/components/schedule/DayAgenda';
import { MonthCalendar } from '@/components/schedule/MonthCalendar';
import { ScheduleCard } from '../../components/schedule/ScheduleCard';
import { ScheduleViewSwitcher } from '@/components/schedule/ScheduleViewSwitcher';
import { WeekStrip } from '@/components/schedule/WeekStrip';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, radius, shadow, spacing } from '@/theme/tokens';
import { type Company } from '../../types/company';
import { type Schedule, type ScheduleType } from '../../types/schedule';
import {
  WEEK_STARTS_ON,
  type MonthGridCell,
  type ScheduleSection,
  type ScheduleViewMode,
  buildMonthGrid,
  buildScheduleDayMap,
  buildWeekBuckets,
  groupSchedulesBySections,
  parseScheduleDate,
  toDateKey,
} from '@/utils/scheduleCalendar';

interface MonthCalendarCellModel extends MonthGridCell {
  isToday: boolean;
  isSelected: boolean;
}

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

export default function SchedulesScreen() {
  const queryClient = useQueryClient();
  const initialDate = useMemo(() => startOfDay(new Date()), []);
  const defaultDateTime = useMemo(() => getDefaultDateTimeInput(), []);

  const [viewMode, setViewMode] = useState<ScheduleViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [focusedWeekStart, setFocusedWeekStart] = useState<Date>(
    startOfWeek(initialDate, { weekStartsOn: WEEK_STARTS_ON }),
  );
  const [focusedMonth, setFocusedMonth] = useState<Date>(startOfMonth(initialDate));

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  const [createCompanyId, setCreateCompanyId] = useState<string | null>(null);
  const [createType, setCreateType] = useState<ScheduleType>('interview');
  const [createTitle, setCreateTitle] = useState('');
  const [createDateInput, setCreateDateInput] = useState(defaultDateTime.date);
  const [createTimeInput, setCreateTimeInput] = useState(defaultDateTime.time);

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

  const createScheduleMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all });
      const nextDateTime = getDefaultDateTimeInput();
      setCreateType('interview');
      setCreateTitle('');
      setCreateDateInput(nextDateTime.date);
      setCreateTimeInput(nextDateTime.time);
      setIsCreateModalVisible(false);
    },
    onError: (error: unknown) => {
      Alert.alert('スケジュール追加エラー', getErrorMessage(error));
    },
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

  useEffect(() => {
    if (!createCompanyId && companies.length > 0) {
      const firstCompany = companies[0];
      if (firstCompany) {
        setCreateCompanyId(firstCompany.id);
      }
    }
  }, [companies, createCompanyId]);

  const groupedSections = useMemo<ScheduleSection[]>(() => {
    return groupSchedulesBySections(schedules);
  }, [schedules]);

  const hasSchedules = groupedSections.some((section) => section.data.length > 0);
  const sections = hasSchedules ? groupedSections.filter((section) => section.data.length > 0) : [];

  const schedulesByDay = useMemo<Map<string, Schedule[]>>(() => {
    return buildScheduleDayMap(schedules);
  }, [schedules]);

  const weekBuckets = useMemo(() => {
    return buildWeekBuckets(schedulesByDay);
  }, [schedulesByDay]);

  const selectedDayKey = useMemo(() => {
    return toDateKey(selectedDate);
  }, [selectedDate]);

  const selectedDaySchedules = useMemo<Schedule[]>(() => {
    return schedulesByDay.get(selectedDayKey) ?? [];
  }, [schedulesByDay, selectedDayKey]);

  const focusedWeekKey = useMemo(() => {
    return toDateKey(focusedWeekStart);
  }, [focusedWeekStart]);

  const focusedWeekSchedules = useMemo<Schedule[]>(() => {
    const selectedWeek = weekBuckets.find((bucket) => bucket.key === focusedWeekKey);
    return selectedWeek?.schedules ?? [];
  }, [focusedWeekKey, weekBuckets]);

  const monthCells = useMemo<MonthCalendarCellModel[]>(() => {
    const monthGrid = buildMonthGrid(focusedMonth, schedulesByDay);

    return monthGrid.map((cell) => ({
      ...cell,
      isToday: isSameDay(cell.date, initialDate),
      isSelected: cell.key === selectedDayKey,
    }));
  }, [focusedMonth, initialDate, schedulesByDay, selectedDayKey]);

  const isEditPending = updateScheduleMutation.isPending || deleteScheduleMutation.isPending;
  const isRefreshing = schedulesQuery.isRefetching || companiesQuery.isRefetching;

  const handleRefresh = async (): Promise<void> => {
    await Promise.all([schedulesQuery.refetch(), companiesQuery.refetch()]);
  };

  const handleSelectDate = (date: Date): void => {
    const normalized = startOfDay(date);

    setSelectedDate(normalized);
    setFocusedWeekStart(startOfWeek(normalized, { weekStartsOn: WEEK_STARTS_ON }));
    setFocusedMonth(startOfMonth(normalized));
  };

  const openDayDetail = (date: Date): void => {
    handleSelectDate(date);
    router.push({
      pathname: '/schedule-day/[dateKey]',
      params: { dateKey: toDateKey(date) },
    });
  };

  const handleChangeViewMode = (nextMode: ScheduleViewMode): void => {
    setViewMode(nextMode);

    if (nextMode === 'week') {
      setFocusedWeekStart(startOfWeek(selectedDate, { weekStartsOn: WEEK_STARTS_ON }));
    }

    if (nextMode === 'month') {
      setFocusedMonth(startOfMonth(selectedDate));
    }
  };

  const openCreateModal = (): void => {
    const nextDateTime = getDefaultDateTimeInput();

    setCreateType('interview');
    setCreateTitle('');
    setCreateTimeInput(nextDateTime.time);
    setCreateDateInput(viewMode === 'list' ? nextDateTime.date : format(selectedDate, 'yyyy-MM-dd'));
    setIsCreateModalVisible(true);
  };

  const handleCreateSchedule = async (): Promise<void> => {
    if (!createCompanyId) {
      Alert.alert('入力エラー', '企業を選択してください');
      return;
    }

    const trimmedTitle = createTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('入力エラー', 'タイトルを入力してください');
      return;
    }

    const parsedDate = new Date(`${createDateInput}T${createTimeInput}:00`);
    if (!isValid(parsedDate)) {
      Alert.alert('入力エラー', '日時の形式が不正です');
      return;
    }

    await createScheduleMutation.mutateAsync({
      companyId: createCompanyId,
      type: createType,
      title: trimmedTitle,
      scheduledAt: parsedDate.toISOString(),
    });
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

  const handlePrevWeek = (): void => {
    const nextSelected = startOfDay(addWeeks(selectedDate, -1));
    setSelectedDate(nextSelected);
    setFocusedWeekStart(startOfWeek(nextSelected, { weekStartsOn: WEEK_STARTS_ON }));
    setFocusedMonth(startOfMonth(nextSelected));
  };

  const handleNextWeek = (): void => {
    const nextSelected = startOfDay(addWeeks(selectedDate, 1));
    setSelectedDate(nextSelected);
    setFocusedWeekStart(startOfWeek(nextSelected, { weekStartsOn: WEEK_STARTS_ON }));
    setFocusedMonth(startOfMonth(nextSelected));
  };

  const handlePrevMonth = (): void => {
    const nextFocused = startOfMonth(addMonths(focusedMonth, -1));
    const nextSelected = startOfDay(addMonths(selectedDate, -1));

    setFocusedMonth(nextFocused);
    setSelectedDate(nextSelected);
    setFocusedWeekStart(startOfWeek(nextSelected, { weekStartsOn: WEEK_STARTS_ON }));
  };

  const handleNextMonth = (): void => {
    const nextFocused = startOfMonth(addMonths(focusedMonth, 1));
    const nextSelected = startOfDay(addMonths(selectedDate, 1));

    setFocusedMonth(nextFocused);
    setSelectedDate(nextSelected);
    setFocusedWeekStart(startOfWeek(nextSelected, { weekStartsOn: WEEK_STARTS_ON }));
  };

  const renderListView = () => {
    return (
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ScheduleCard schedule={item} onLongPress={() => openEditModal(item)} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        onRefresh={handleRefresh}
        refreshing={isRefreshing}
        ItemSeparatorComponent={() => <View style={styles.listGap} />}
        SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
        ListEmptyComponent={
          !hasSchedules ? (
            <AppCard>
              <EmptyState
                title="スケジュールを追加してください"
                description="＋ボタンから面接や締切を登録できます。"
              />
            </AppCard>
          ) : null
        }
      />
    );
  };

  const renderDayView = () => {
    return (
      <ScrollView
        contentContainerStyle={styles.viewContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
      >
        <DayAgenda
          date={selectedDate}
          schedules={selectedDaySchedules}
          emptyTitle="この日の予定はありません"
          emptyDescription="別の日を選択するか、＋ボタンから予定を追加してください。"
          onLongPressSchedule={openEditModal}
        />
      </ScrollView>
    );
  };

  const renderWeekView = () => {
    return (
      <ScrollView
        contentContainerStyle={styles.viewContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
      >
        <WeekStrip
          weekStart={focusedWeekStart}
          selectedDate={selectedDate}
          dayMap={schedulesByDay}
          onSelectDate={handleSelectDate}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
        />

        {focusedWeekSchedules.length === 0 ? (
          <AppCard>
            <EmptyState
              title="今週の予定はありません"
              description="別の週へ移動するか、＋ボタンから予定を追加してください。"
            />
          </AppCard>
        ) : null}

        <DayAgenda
          date={selectedDate}
          schedules={selectedDaySchedules}
          emptyTitle="選択日の予定はありません"
          emptyDescription="週上部の日付を切り替えると、日別の予定を確認できます。"
          onLongPressSchedule={openEditModal}
        />
      </ScrollView>
    );
  };

  const renderMonthView = () => {
    return (
      <ScrollView
        contentContainerStyle={styles.viewContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
      >
        <MonthCalendar
          focusedMonth={focusedMonth}
          cells={monthCells}
          onSelectDate={openDayDetail}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onLongPressCell={(cell) => {
            const firstSchedule = cell.schedules[0];
            if (firstSchedule) {
              openEditModal(firstSchedule);
            }
          }}
        />
      </ScrollView>
    );
  };

  const renderCurrentView = () => {
    if (viewMode === 'day') {
      return renderDayView();
    }

    if (viewMode === 'week') {
      return renderWeekView();
    }

    if (viewMode === 'month') {
      return renderMonthView();
    }

    return renderListView();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screenHeader}>
        <SectionHeader
          title="予定管理"
          subtitle="一覧 / 日 / 週 / 月ビューを切り替え（カード・セル長押しで編集）"
        />
        <ScheduleViewSwitcher value={viewMode} onChange={handleChangeViewMode} />
      </View>

      {schedulesQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>スケジュールを読み込み中...</Text>
        </View>
      ) : (
        renderCurrentView()
      )}

      <View style={styles.fabWrap}>
        <Pressable style={styles.fab} onPress={openCreateModal}>
          <Text style={styles.fabLabel}>＋</Text>
        </Pressable>
      </View>

      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <SectionHeader title="スケジュールを追加" subtitle="企業・種類・日時・タイトルを入力" />

            <Text style={styles.fieldLabel}>企業</Text>
            <ScrollView style={styles.companyScrollArea}>
              {companies.length === 0 ? (
                <Text style={styles.helperText}>先に企業を追加してください</Text>
              ) : (
                <View style={styles.companyOptions}>
                  {companies.map((company) => {
                    const isSelected = createCompanyId === company.id;
                    return (
                      <Pressable
                        key={company.id}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => setCreateCompanyId(company.id)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]} numberOfLines={1}>
                          {company.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <Text style={styles.fieldLabel}>種類</Text>
            <View style={styles.typeOptions}>
              {SCHEDULE_TYPES.map((type) => {
                const isSelected = createType === type.value;

                return (
                  <Pressable
                    key={type.value}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setCreateType(type.value)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{type.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>タイトル</Text>
            <TextInput
              value={createTitle}
              onChangeText={setCreateTitle}
              placeholder="例: 一次面接"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>日時</Text>
            <View style={styles.dateTimeRow}>
              <TextInput
                value={createDateInput}
                onChangeText={setCreateDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.dateInput]}
              />
              <TextInput
                value={createTimeInput}
                onChangeText={setCreateTimeInput}
                placeholder="HH:mm"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.timeInput]}
              />
            </View>

            <View style={styles.modalActions}>
              <AppButton
                label="キャンセル"
                variant="secondary"
                onPress={() => setIsCreateModalVisible(false)}
                style={styles.flexButton}
              />
              <AppButton
                label="追加"
                onPress={() => {
                  void handleCreateSchedule();
                }}
                loading={createScheduleMutation.isPending}
                disabled={companies.length === 0}
                style={styles.flexButton}
              />
            </View>
          </View>
        </View>
      </Modal>

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
  screenHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 112,
    flexGrow: 1,
  },
  viewContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 112,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
  },
  listGap: {
    height: 10,
  },
  sectionGap: {
    height: 18,
  },
  fabWrap: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    ...shadow.floating,
  },
  fabLabel: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 30,
    fontWeight: '500',
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
  helperText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 6,
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
