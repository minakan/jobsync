import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addHours, format, isThisWeek, isToday, isValid, parseISO } from 'date-fns';

import { companyQueryKeys, fetchCompanies } from '../../api/companies';
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  scheduleQueryKeys,
  updateSchedule,
} from '../../api/schedules';
import { ScheduleCard } from '../../components/schedule/ScheduleCard';
import { type Company } from '../../types/company';
import { type Schedule, type ScheduleType } from '../../types/schedule';

interface ScheduleSection {
  title: string;
  data: Schedule[];
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

const parseScheduleDate = (value: string): Date | null => {
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    return null;
  }
  return parsed;
};

const sortByScheduledAt = (left: Schedule, right: Schedule): number => {
  const leftDate = parseScheduleDate(left.scheduledAt);
  const rightDate = parseScheduleDate(right.scheduledAt);

  if (!leftDate && !rightDate) {
    return 0;
  }
  if (!leftDate) {
    return 1;
  }
  if (!rightDate) {
    return -1;
  }
  return leftDate.getTime() - rightDate.getTime();
};

const groupSchedules = (schedules: Schedule[]): ScheduleSection[] => {
  const today: Schedule[] = [];
  const thisWeek: Schedule[] = [];
  const later: Schedule[] = [];

  for (const schedule of schedules) {
    const scheduleDate = parseScheduleDate(schedule.scheduledAt);
    if (!scheduleDate) {
      later.push(schedule);
      continue;
    }

    if (isToday(scheduleDate)) {
      today.push(schedule);
      continue;
    }

    if (isThisWeek(scheduleDate, { weekStartsOn: 1 })) {
      thisWeek.push(schedule);
      continue;
    }

    later.push(schedule);
  }

  return [
    { title: '今日', data: [...today].sort(sortByScheduledAt) },
    { title: '今週', data: [...thisWeek].sort(sortByScheduledAt) },
    { title: 'それ以降', data: [...later].sort(sortByScheduledAt) },
  ];
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
  const defaultDateTime = useMemo(() => getDefaultDateTimeInput(), []);
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
    return groupSchedules(schedules);
  }, [schedules]);

  const hasSchedules = groupedSections.some((section) => section.data.length > 0);
  const sections = hasSchedules
    ? groupedSections.filter((section) => section.data.length > 0)
    : [];

  const handleRefresh = async (): Promise<void> => {
    await Promise.all([schedulesQuery.refetch(), companiesQuery.refetch()]);
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
      {schedulesQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ScheduleCard schedule={item} onLongPress={() => openEditModal(item)} />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          onRefresh={handleRefresh}
          refreshing={schedulesQuery.isRefetching || companiesQuery.isRefetching}
          ItemSeparatorComponent={() => <View style={styles.listGap} />}
          SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
          ListEmptyComponent={
            !hasSchedules ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>スケジュールを追加してください</Text>
              </View>
            ) : null
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => setIsCreateModalVisible(true)}>
        <Text style={styles.fabLabel}>＋</Text>
      </Pressable>

      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>スケジュールを追加</Text>

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
                        style={[styles.companyOptionButton, isSelected && styles.companyOptionButtonSelected]}
                        onPress={() => setCreateCompanyId(company.id)}
                      >
                        <Text
                          style={[styles.companyOptionText, isSelected && styles.companyOptionTextSelected]}
                          numberOfLines={1}
                        >
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
                    style={[styles.typeOptionButton, isSelected && styles.typeOptionButtonSelected]}
                    onPress={() => setCreateType(type.value)}
                  >
                    <Text style={[styles.typeOptionText, isSelected && styles.typeOptionTextSelected]}>
                      {type.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>タイトル</Text>
            <TextInput
              value={createTitle}
              onChangeText={setCreateTitle}
              placeholder="例: 一次面接"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>日時</Text>
            <View style={styles.dateTimeRow}>
              <TextInput
                value={createDateInput}
                onChangeText={setCreateDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.dateInput]}
              />
              <TextInput
                value={createTimeInput}
                onChangeText={setCreateTimeInput}
                placeholder="HH:mm"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.timeInput]}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => setIsCreateModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.actionButton,
                  styles.submitButton,
                  (createScheduleMutation.isPending || companies.length === 0) && styles.buttonDisabled,
                ]}
                onPress={handleCreateSchedule}
                disabled={createScheduleMutation.isPending || companies.length === 0}
              >
                {createScheduleMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>追加</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 112,
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  listGap: {
    height: 10,
  },
  sectionGap: {
    height: 18,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    shadowColor: '#1F2937',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabLabel: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    gap: 12,
    maxHeight: '90%',
  },
  modalTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  fieldLabel: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
  companyScrollArea: {
    maxHeight: 140,
  },
  companyOptions: {
    gap: 8,
  },
  companyOptionButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  companyOptionButtonSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  companyOptionText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  companyOptionTextSelected: {
    color: '#1D4ED8',
  },
  typeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeOptionButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  typeOptionButtonSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  typeOptionText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  typeOptionTextSelected: {
    color: '#1D4ED8',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    backgroundColor: '#FFFFFF',
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
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 6,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: '#2563EB',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
