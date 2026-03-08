import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { companyQueryKeys, createCompany, fetchCompanies } from '../../api/companies';
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return '通信に失敗しました。時間をおいて再試行してください。';
};

export default function CompaniesScreen() {
  const queryClient = useQueryClient();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<CompanyStatus>(CompanyStatus.Interested);

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
      setIsModalVisible(false);
    },
    onError: (error: unknown) => {
      Alert.alert('企業追加エラー', getErrorMessage(error));
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

    await createCompanyMutation.mutateAsync({
      name: trimmedName,
      status: selectedStatus,
      priority: 3,
    });
  };

  const renderCompanyItem = ({ item }: { item: Company }) => {
    return (
      <View style={styles.companyCard}>
        <View style={styles.companyHeader}>
          <Text style={styles.companyName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.priorityText}>優先度 {item.priority}</Text>
        </View>
        <StatusBadge status={item.status} />
      </View>
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

      <Pressable style={styles.fab} onPress={() => setIsModalVisible(true)}>
        <Text style={styles.fabLabel}>＋</Text>
      </Pressable>

      <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={() => setIsModalVisible(false)}>
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
                  setIsModalVisible(false);
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
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  buttonDisabled: {
    opacity: 0.6,
  },
});
