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
import { STATUS_CONFIG, StatusBadge } from '../../components/company/StatusBadge';
import { CompanyStatus, type Company } from '../../types/company';

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
  const [detailPriority, setDetailPriority] = useState<number>(3);
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
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateCompanyPayload;
    }) => updateCompany(id, payload),
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

  const isDetailPending = updateCompanyMutation.isPending || deleteCompanyMutation.isPending;

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
        style={({ pressed }) => [styles.companyCard, pressed && styles.companyCardPressed]}
        onPress={() => handleOpenCompanyDetail(item)}
      >
        <View style={styles.companyHeader}>
          <Text style={styles.companyName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.priorityText}>優先度 {item.priority}</Text>
        </View>
        <StatusBadge status={item.status} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {companiesQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
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
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>企業を追加してください</Text>
            </View>
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
            <Text style={styles.modalTitle}>企業を追加</Text>

            <Text style={styles.fieldLabel}>会社名</Text>
            <TextInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="例: 株式会社サンプル"
              style={styles.input}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>ステータス</Text>
            <View style={styles.statusOptions}>
              {STATUS_OPTIONS.map((status) => {
                const isSelected = selectedStatus === status;
                return (
                  <Pressable
                    key={status}
                    style={[styles.statusOptionButton, isSelected && styles.statusOptionButtonSelected]}
                    onPress={() => setSelectedStatus(status)}
                  >
                    <Text style={[styles.statusOptionText, isSelected && styles.statusOptionTextSelected]}>
                      {STATUS_CONFIG[status].label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => {
                  setIsCreateModalVisible(false);
                }}
              >
                <Text style={styles.cancelButtonText}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.submitButton, createCompanyMutation.isPending && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={createCompanyMutation.isPending}
              >
                {createCompanyMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>追加</Text>
                )}
              </Pressable>
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
            <Text style={styles.modalTitle}>企業詳細</Text>

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
                <View style={styles.statusOptions}>
                  {STATUS_OPTIONS.map((status) => {
                    const isSelected = detailStatus === status;
                    return (
                      <Pressable
                        key={status}
                        style={[styles.statusOptionButton, isSelected && styles.statusOptionButtonSelected]}
                        onPress={() => setDetailStatus(status)}
                        disabled={isDetailPending}
                      >
                        <Text style={[styles.statusOptionText, isSelected && styles.statusOptionTextSelected]}>
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
                        <Text style={[styles.priorityButtonText, isSelected && styles.priorityButtonTextSelected]}>
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
                  placeholderTextColor="#9CA3AF"
                  style={[styles.input, styles.notesInput]}
                  multiline
                  textAlignVertical="top"
                  editable={!isDetailPending}
                />

                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.actionButton, styles.cancelButton, isDetailPending && styles.buttonDisabled]}
                    onPress={handleCloseCompanyDetail}
                    disabled={isDetailPending}
                  >
                    <Text style={styles.cancelButtonText}>閉じる</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.submitButton, isDetailPending && styles.buttonDisabled]}
                    onPress={handleUpdateCompany}
                    disabled={isDetailPending}
                  >
                    {updateCompanyMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>保存</Text>
                    )}
                  </Pressable>
                </View>

                <Pressable
                  style={[
                    styles.deleteButton,
                    deleteCompanyMutation.isPending && styles.buttonDisabled,
                  ]}
                  onPress={handleDeleteCompany}
                  disabled={isDetailPending}
                >
                  {deleteCompanyMutation.isPending ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <Text style={styles.deleteButtonText}>企業を削除</Text>
                  )}
                </Pressable>
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
  listGap: {
    height: 10,
  },
  companyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 8,
  },
  companyCardPressed: {
    opacity: 0.75,
  },
  companyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  companyName: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  priorityText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
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
  },
  detailScrollArea: {
    maxHeight: 480,
  },
  detailContent: {
    gap: 12,
    paddingBottom: 8,
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
  readOnlyField: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
  },
  readOnlyValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
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
  notesInput: {
    minHeight: 110,
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priorityOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    width: 40,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityButtonSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  priorityButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
  priorityButtonTextSelected: {
    color: '#1D4ED8',
  },
  statusOptionButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  statusOptionButtonSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  statusOptionText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  statusOptionTextSelected: {
    color: '#1D4ED8',
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
  deleteButton: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
