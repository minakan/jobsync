import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  companyQueryKeys,
  createCompany,
  deleteCompany,
  fetchCompanies,
  type UpdateCompanyPayload,
  updateCompany,
} from '../../api/companies';
import { STATUS_CONFIG, StatusBadge } from '@/components/company/StatusBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CompanyStatus, type Company } from '../../types/company';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

const STATUS_OPTIONS: CompanyStatus[] = [
  CompanyStatus.Interested,
  CompanyStatus.Applied,
  CompanyStatus.Screening,
  CompanyStatus.Interview,
  CompanyStatus.Offer,
  CompanyStatus.Rejected,
];

const PRIORITY_OPTIONS = [1, 2, 3, 4, 5] as const;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return '通信に失敗しました。時間をおいて再試行してください。';
};

export default function CompaniesScreen() {
  const queryClient = useQueryClient();
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<CompanyStatus>(CompanyStatus.Interested);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [detailStatus, setDetailStatus] = useState<CompanyStatus>(CompanyStatus.Interested);
  const [detailPriority, setDetailPriority] = useState(3);
  const [detailNotes, setDetailNotes] = useState('');

  const companiesQuery = useQuery({
    queryKey: companyQueryKeys.all,
    queryFn: fetchCompanies,
  });

  const createCompanyMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKeys.all });
      setCompanyName('');
      setSelectedStatus(CompanyStatus.Interested);
      setIsCreateModalVisible(false);
    },
    onError: (error: unknown) => {
      Alert.alert('企業追加エラー', getErrorMessage(error));
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCompanyPayload }) =>
      updateCompany(id, payload),
    onSuccess: async (updatedCompany: Company) => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKeys.all });
      setSelectedCompany(updatedCompany);
      setDetailStatus(updatedCompany.status);
      setDetailPriority(updatedCompany.priority);
      setDetailNotes(updatedCompany.notes ?? updatedCompany.note ?? '');
    },
    onError: (error: unknown) => {
      Alert.alert('企業更新エラー', getErrorMessage(error));
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: deleteCompany,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKeys.all });
      setSelectedCompany(null);
    },
    onError: (error: unknown) => {
      Alert.alert('企業削除エラー', getErrorMessage(error));
    },
  });

  useEffect(() => {
    if (companiesQuery.isError) {
      Alert.alert('企業取得エラー', getErrorMessage(companiesQuery.error));
    }
  }, [companiesQuery.error, companiesQuery.isError]);

  const companies = useMemo<Company[]>(() => {
    return companiesQuery.data ?? [];
  }, [companiesQuery.data]);

  const isDetailPending = updateCompanyMutation.isPending || deleteCompanyMutation.isPending;

  const handleRefresh = async (): Promise<void> => {
    await companiesQuery.refetch();
  };

  const handleSubmit = async (): Promise<void> => {
    const trimmedName = companyName.trim();
    if (!trimmedName) {
      Alert.alert('入力エラー', '会社名は必須です');
      return;
    }

    try {
      await createCompanyMutation.mutateAsync({
        name: trimmedName,
        status: selectedStatus,
        priority: 3,
      });
    } catch {
      // Error is handled by createCompanyMutation.onError.
    }
  };

  const handleOpenCompanyDetail = (company: Company): void => {
    setSelectedCompany(company);
    setDetailStatus(company.status);
    setDetailPriority(company.priority);
    setDetailNotes(company.notes ?? company.note ?? '');
  };

  const handleCloseCompanyDetail = (): void => {
    if (isDetailPending) {
      return;
    }

    setSelectedCompany(null);
  };

  const handleUpdateCompany = async (): Promise<void> => {
    if (!selectedCompany) {
      return;
    }

    try {
      await updateCompanyMutation.mutateAsync({
        id: selectedCompany.id,
        payload: {
          status: detailStatus,
          priority: detailPriority,
          notes: detailNotes,
        },
      });
    } catch {
      // Error is handled by updateCompanyMutation.onError.
    }
  };

  const handleDeleteCompany = (): void => {
    if (!selectedCompany || isDetailPending) {
      return;
    }

    Alert.alert('企業を削除', 'この企業を削除しますか？この操作は取り消せません。', [
      {
        text: 'キャンセル',
        style: 'cancel',
      },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          deleteCompanyMutation.mutate(selectedCompany.id);
        },
      },
    ]);
  };

  const renderCompanyItem = ({ item }: { item: Company }) => {
    return (
      <Pressable
        style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
        onPress={() => handleOpenCompanyDetail(item)}
      >
        <AppCard>
          <View style={styles.companyHeader}>
            <Text style={styles.companyName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.priorityText}>優先度 {item.priority}</Text>
          </View>
          <StatusBadge status={item.status} />
        </AppCard>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {companiesQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>企業データを読み込み中...</Text>
        </View>
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.id}
          renderItem={renderCompanyItem}
          contentContainerStyle={styles.listContent}
          onRefresh={handleRefresh}
          refreshing={companiesQuery.isRefetching}
          ItemSeparatorComponent={() => <View style={styles.listGap} />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <SectionHeader
                title="企業管理"
                subtitle="応募企業の進捗・優先度・メモを一元管理"
              />
            </View>
          }
          ListEmptyComponent={
            <AppCard>
              <EmptyState
                title="企業を追加してください"
                description="＋ボタンから最初の企業を登録できます。"
              />
            </AppCard>
          }
        />
      )}

      <View style={styles.fabWrap}>
        <Pressable style={styles.fab} onPress={() => setIsCreateModalVisible(true)}>
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
            <SectionHeader title="企業を追加" subtitle="会社名と初期ステータスを設定" />

            <Text style={styles.fieldLabel}>会社名</Text>
            <TextInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="例: 株式会社サンプル"
              style={styles.input}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>ステータス</Text>
            <View style={styles.chipWrap}>
              {STATUS_OPTIONS.map((status) => {
                const isSelected = selectedStatus === status;
                return (
                  <Pressable
                    key={status}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setSelectedStatus(status)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {STATUS_CONFIG[status].label}
                    </Text>
                  </Pressable>
                );
              })}
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
                  void handleSubmit();
                }}
                loading={createCompanyMutation.isPending}
                style={styles.flexButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedCompany !== null}
        transparent
        animationType="slide"
        onRequestClose={handleCloseCompanyDetail}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <SectionHeader title="企業詳細" subtitle="ステータス、優先度、メモを編集" />

            {selectedCompany ? (
              <ScrollView
                style={styles.detailScrollArea}
                contentContainerStyle={styles.detailContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.fieldLabel}>企業名</Text>
                <View style={styles.readOnlyField}>
                  <Text style={styles.readOnlyValue}>{selectedCompany.name}</Text>
                </View>

                <Text style={styles.fieldLabel}>ステータス</Text>
                <View style={styles.chipWrap}>
                  {STATUS_OPTIONS.map((status) => {
                    const isSelected = detailStatus === status;
                    return (
                      <Pressable
                        key={status}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => setDetailStatus(status)}
                        disabled={isDetailPending}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {STATUS_CONFIG[status].label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>優先度</Text>
                <View style={styles.priorityOptions}>
                  {PRIORITY_OPTIONS.map((priority) => {
                    const isSelected = detailPriority === priority;
                    return (
                      <Pressable
                        key={priority}
                        style={[styles.priorityButton, isSelected && styles.priorityButtonSelected]}
                        onPress={() => setDetailPriority(priority)}
                        disabled={isDetailPending}
                      >
                        <Text
                          style={[
                            styles.priorityButtonText,
                            isSelected && styles.priorityButtonTextSelected,
                          ]}
                        >
                          {priority}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>メモ</Text>
                <TextInput
                  value={detailNotes}
                  onChangeText={setDetailNotes}
                  placeholder="メモを入力"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.notesInput]}
                  multiline
                  textAlignVertical="top"
                  editable={!isDetailPending}
                />

                <View style={styles.modalActions}>
                  <AppButton
                    label="閉じる"
                    variant="secondary"
                    onPress={handleCloseCompanyDetail}
                    disabled={isDetailPending}
                    style={styles.flexButton}
                  />
                  <AppButton
                    label="保存"
                    onPress={() => {
                      void handleUpdateCompany();
                    }}
                    loading={updateCompanyMutation.isPending}
                    disabled={isDetailPending}
                    style={styles.flexButton}
                  />
                </View>

                <AppButton
                  label="企業を削除"
                  variant="danger"
                  onPress={handleDeleteCompany}
                  loading={deleteCompanyMutation.isPending}
                  disabled={isDetailPending}
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
    paddingTop: spacing.md,
    paddingBottom: 112,
    flexGrow: 1,
  },
  listHeader: {
    marginBottom: 12,
  },
  listGap: {
    height: 10,
  },
  cardPressable: {
    borderRadius: radius.md,
  },
  cardPressed: {
    opacity: 0.88,
  },
  companyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  companyName: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  priorityText: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '700',
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
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  detailScrollArea: {
    maxHeight: 480,
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
  readOnlyField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
  },
  readOnlyValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
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
  notesInput: {
    minHeight: 110,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  priorityOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    width: 40,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  priorityButtonText: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '700',
  },
  priorityButtonTextSelected: {
    color: colors.primaryStrong,
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
