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
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addHours,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  isValid,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
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
import { WeekTimeGrid } from '@/components/schedule/WeekTimeGrid';
import { ScheduleCard } from '../../components/schedule/ScheduleCard';
import { ScheduleViewSwitcher } from '@/components/schedule/ScheduleViewSwitcher';
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
  groupSchedulesBySections,
  parseScheduleEnd,
  parseScheduleStart,
  toDateKey,
} from '@/utils/scheduleCalendar';

interface MonthCalendarCellModel extends MonthGridCell {
  isToday: boolean;
  isSelected: boolean;
}

type PickerScope = 'create' | 'edit';
type PickerField = 'start' | 'end';
type PickerMode = 'date' | 'time';

interface PickerState {
  scope: PickerScope;
  field: PickerField;
  mode: PickerMode;
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

const getDefaultDateRange = (): { start: Date; end: Date } => {
  const start = addHours(new Date(), 1);
  const end = addHours(start, 1);
  return { start, end };
};

const getDateRangeFromSchedule = (schedule: Schedule): { start: Date; end: Date; isAllDay: boolean } => {
  const parsedStart = parseScheduleStart(schedule);
  const parsedEnd = parseScheduleEnd(schedule);

  const fallback = getDefaultDateRange();
  return {
    start: parsedStart ?? fallback.start,
    end: parsedEnd ?? addHours(parsedStart ?? fallback.start, 1),
    isAllDay: schedule.isAllDay,
  };
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

const normalizeAllDayRange = (date: Date): { start: Date; end: Date } => {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  return { start, end };
};

const formatDateLabel = (value: Date): string => format(value, 'yyyy-MM-dd');
const formatTimeLabel = (value: Date): string => format(value, 'HH:mm');

export default function SchedulesScreen() {
  const queryClient = useQueryClient();
  const initialDate = useMemo(() => startOfDay(new Date()), []);
  const defaultRange = useMemo(() => getDefaultDateRange(), []);

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
  const [createStartAt, setCreateStartAt] = useState(defaultRange.start);
  const [createEndAt, setCreateEndAt] = useState(defaultRange.end);
  const [createIsAllDay, setCreateIsAllDay] = useState(false);

  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [editType, setEditType] = useState<ScheduleType>('interview');
  const [editTitle, setEditTitle] = useState('');
  const [editStartAt, setEditStartAt] = useState(defaultRange.start);
  const [editEndAt, setEditEndAt] = useState(defaultRange.end);
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

  const createScheduleMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all });
      const nextRange = getDefaultDateRange();
      setCreateType('interview');
      setCreateTitle('');
      setCreateStartAt(nextRange.start);
      setCreateEndAt(nextRange.end);
      setCreateIsAllDay(false);
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

  const companies = useMemo<Company[]>(() => companiesQuery.data ?? [], [companiesQuery.data]);
  const schedules = useMemo<Schedule[]>(() => schedulesQuery.data ?? [], [schedulesQuery.data]);

  useEffect(() => {
    if (!createCompanyId && companies.length > 0) {
      const firstCompany = companies[0];
      if (firstCompany) {
        setCreateCompanyId(firstCompany.id);
      }
    }
  }, [companies, createCompanyId]);

  const groupedSections = useMemo<ScheduleSection[]>(() => groupSchedulesBySections(schedules), [schedules]);
  const hasSchedules = groupedSections.some((section) => section.data.length > 0);
  const sections = hasSchedules ? groupedSections.filter((section) => section.data.length > 0) : [];

  const schedulesByDay = useMemo<Map<string, Schedule[]>>(() => buildScheduleDayMap(schedules), [schedules]);

  const selectedDayKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const selectedDaySchedules = useMemo<Schedule[]>(() => schedulesByDay.get(selectedDayKey) ?? [], [schedulesByDay, selectedDayKey]);

  const focusedWeekSchedules = useMemo<Schedule[]>(() => {
    return Array.from({ length: 7 }, (_, dayOffset) => toDateKey(addDays(focusedWeekStart, dayOffset))).flatMap(
      (dayKey) => schedulesByDay.get(dayKey) ?? [],
    );
  }, [focusedWeekStart, schedulesByDay]);

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
    const nextRange = getDefaultDateRange();
    const start = viewMode === 'list' ? nextRange.start : new Date(selectedDate);
    if (viewMode !== 'list') {
      start.setHours(nextRange.start.getHours(), nextRange.start.getMinutes(), 0, 0);
    }

    setCreateType('interview');
    setCreateTitle('');
    setCreateIsAllDay(false);
    setCreateStartAt(start);
    setCreateEndAt(addHours(start, 1));
    setPickerState(null);
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

    const allDayRange = normalizeAllDayRange(createStartAt);
    const startAt = createIsAllDay ? allDayRange.start : createStartAt;
    const endAt = createIsAllDay ? allDayRange.end : createEndAt;

    const validationError = validateRange(startAt, endAt, createIsAllDay);
    if (validationError) {
      Alert.alert('入力エラー', validationError);
      return;
    }

    await createScheduleMutation.mutateAsync({
      companyId: createCompanyId,
      type: createType,
      title: trimmedTitle,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      isAllDay: createIsAllDay,
    });
  };

  const openEditModal = (schedule: Schedule): void => {
    const range = getDateRangeFromSchedule(schedule);

    setSelectedSchedule(schedule);
    setEditCompanyId(schedule.companyId);
    setEditType(schedule.type);
    setEditTitle(schedule.title);
    setEditStartAt(range.start);
    setEditEndAt(range.end);
    setEditIsAllDay(range.isAllDay);
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

  const handleToggleCreateAllDay = (value: boolean): void => {
    setCreateIsAllDay(value);
    if (value) {
      const normalized = normalizeAllDayRange(createStartAt);
      setCreateStartAt(normalized.start);
      setCreateEndAt(normalized.end);
      return;
    }

    if (createEndAt.getTime() <= createStartAt.getTime() || !isSameDay(createStartAt, createEndAt)) {
      setCreateEndAt(addHours(createStartAt, 1));
    }
  };

  const handleToggleEditAllDay = (value: boolean): void => {
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

  const openPicker = (scope: PickerScope, field: PickerField, mode: PickerMode): void => {
    setPickerState({ scope, field, mode });
  };

  const getPickerValue = (state: PickerState): Date => {
    if (state.scope === 'create') {
      return state.field === 'start' ? createStartAt : createEndAt;
    }

    return state.field === 'start' ? editStartAt : editEndAt;
  };

  const applyPickerSelection = (state: PickerState, selected: Date): void => {
    if (state.scope === 'create') {
      const current = state.field === 'start' ? createStartAt : createEndAt;
      const merged = mergeDateTime(current, selected, state.mode);

      if (state.field === 'start') {
        if (createIsAllDay) {
          const normalized = normalizeAllDayRange(merged);
          setCreateStartAt(normalized.start);
          setCreateEndAt(normalized.end);
          return;
        }

        setCreateStartAt(merged);
        if (merged.getTime() >= createEndAt.getTime()) {
          setCreateEndAt(addHours(merged, 1));
        }
        return;
      }

      setCreateEndAt(merged);
      return;
    }

    const current = state.field === 'start' ? editStartAt : editEndAt;
    const merged = mergeDateTime(current, selected, state.mode);

    if (state.field === 'start') {
      if (editIsAllDay) {
        const normalized = normalizeAllDayRange(merged);
        setEditStartAt(normalized.start);
        setEditEndAt(normalized.end);
        return;
      }

      setEditStartAt(merged);
      if (merged.getTime() >= editEndAt.getTime()) {
        setEditEndAt(addHours(merged, 1));
      }
      return;
    }

    setEditEndAt(merged);
  };

  const handlePickerChange = (event: DateTimePickerEvent, selected?: Date): void => {
    const currentPicker = pickerState;
    if (!currentPicker) {
      return;
    }

    if (event.type === 'dismissed' || !selected) {
      setPickerState(null);
      return;
    }

    applyPickerSelection(currentPicker, selected);

    // Close picker after selection for both iOS and Android to keep interaction consistent.
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      setPickerState(null);
    }
  };

  const renderListView = () => (
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

  const renderDayView = () => (
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

  const renderWeekView = () => (
    <ScrollView
      contentContainerStyle={styles.viewContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
    >
      <WeekTimeGrid
        weekStart={focusedWeekStart}
        schedules={focusedWeekSchedules}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onLongPressSchedule={openEditModal}
      />
    </ScrollView>
  );

  const renderMonthView = () => (
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

  const renderDateTimeFields = (
    scope: PickerScope,
    startAt: Date,
    endAt: Date,
    isAllDay: boolean,
    disabled = false,
  ) => (
    <View style={styles.dateTimeFieldsWrap}>
      <View style={styles.toggleRow}>
        <Text style={styles.fieldLabel}>終日</Text>
        <Switch
          value={isAllDay}
          onValueChange={scope === 'create' ? handleToggleCreateAllDay : handleToggleEditAllDay}
          disabled={disabled}
          trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
          thumbColor={isAllDay ? colors.primary : '#FFFFFF'}
        />
      </View>

      <View style={styles.selectorGroup}>
        <Text style={styles.fieldLabel}>開始</Text>
        <View style={styles.selectorRow}>
          <Pressable
            style={[styles.selectorButton, disabled && styles.selectorButtonDisabled]}
            onPress={() => openPicker(scope, 'start', 'date')}
            disabled={disabled}
          >
            <Text style={styles.selectorButtonText}>{formatDateLabel(startAt)}</Text>
          </Pressable>
          {!isAllDay ? (
            <Pressable
              style={[styles.selectorButton, disabled && styles.selectorButtonDisabled]}
              onPress={() => openPicker(scope, 'start', 'time')}
              disabled={disabled}
            >
              <Text style={styles.selectorButtonText}>{formatTimeLabel(startAt)}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!isAllDay ? (
        <View style={styles.selectorGroup}>
          <Text style={styles.fieldLabel}>終了</Text>
          <View style={styles.selectorRow}>
            <Pressable
              style={[styles.selectorButton, disabled && styles.selectorButtonDisabled]}
              onPress={() => openPicker(scope, 'end', 'date')}
              disabled={disabled}
            >
              <Text style={styles.selectorButtonText}>{formatDateLabel(endAt)}</Text>
            </Pressable>
            <Pressable
              style={[styles.selectorButton, disabled && styles.selectorButtonDisabled]}
              onPress={() => openPicker(scope, 'end', 'time')}
              disabled={disabled}
            >
              <Text style={styles.selectorButtonText}>{formatTimeLabel(endAt)}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.helperText}>終日予定は選択日の00:00-24:00として保存されます</Text>
      )}
    </View>
  );

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

            {renderDateTimeFields('create', createStartAt, createEndAt, createIsAllDay)}

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

                {renderDateTimeFields('edit', editStartAt, editEndAt, editIsAllDay, isEditPending)}

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
          value={getPickerValue(pickerState)}
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
  dateTimeFieldsWrap: {
    gap: 10,
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
});
