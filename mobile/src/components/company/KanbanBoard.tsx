import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { STATUS_CONFIG } from '@/components/company/StatusBadge';
import { KanbanCard } from '@/components/company/KanbanCard';
import { CompanyStatus, type Company } from '@/types/company';
import { colors, radius, spacing } from '@/theme/tokens';

interface Props {
  companies: Company[];
  onCardPress: (company: Company) => void;
}

const KANBAN_STATUS_ORDER: CompanyStatus[] = [
  CompanyStatus.Interested,
  CompanyStatus.Applied,
  CompanyStatus.Screening,
  CompanyStatus.Interview,
  CompanyStatus.Offer,
  CompanyStatus.Rejected,
];

const createEmptyGroups = (): Record<CompanyStatus, Company[]> => {
  return {
    [CompanyStatus.Interested]: [],
    [CompanyStatus.Applied]: [],
    [CompanyStatus.Screening]: [],
    [CompanyStatus.Interview]: [],
    [CompanyStatus.Offer]: [],
    [CompanyStatus.Rejected]: [],
  };
};

const getLatestStatusTimestamp = (company: Company): number => {
  const updatedAtTimestamp = new Date(company.updatedAt).getTime();
  let latestTimestamp = Number.isNaN(updatedAtTimestamp) ? 0 : updatedAtTimestamp;

  for (const history of company.status_history ?? []) {
    const timestamp = new Date(history.changed_at).getTime();
    if (!Number.isNaN(timestamp) && timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
    }
  }

  return latestTimestamp;
};

export const KanbanBoard = ({ companies, onCardPress }: Props) => {
  const { height } = useWindowDimensions();
  const columnHeight = Math.max(260, height - 290);

  const groupedCompanies = useMemo(() => {
    const groups = createEmptyGroups();

    for (const company of companies) {
      groups[company.status].push(company);
    }

    for (const status of KANBAN_STATUS_ORDER) {
      groups[status].sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }

        return getLatestStatusTimestamp(b) - getLatestStatusTimestamp(a);
      });
    }

    return groups;
  }, [companies]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.boardContent}
      >
        {KANBAN_STATUS_ORDER.map((status) => {
          const isRejected = status === CompanyStatus.Rejected;
          const columnCompanies = groupedCompanies[status];
          const labelColor = isRejected ? colors.muted : STATUS_CONFIG[status].color;

          return (
            <View key={status} style={[styles.column, isRejected && styles.rejectedColumn]}>
              <View style={styles.headerRow}>
                <Text style={[styles.headerLabel, { color: labelColor }]}>{STATUS_CONFIG[status].label}</Text>
                <View style={[styles.countBadge, isRejected && styles.rejectedCountBadge]}>
                  <Text style={[styles.countLabel, { color: labelColor }]}>{columnCompanies.length}</Text>
                </View>
              </View>

              <ScrollView
                style={[styles.columnScroll, { height: columnHeight }]}
                contentContainerStyle={styles.columnContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {columnCompanies.map((company) => {
                  return (
                    <KanbanCard
                      key={company.id}
                      company={company}
                      onPress={() => onCardPress(company)}
                    />
                  );
                })}

                {columnCompanies.length === 0 ? <Text style={styles.emptyText}>企業なし</Text> : null}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  boardContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 112,
    gap: spacing.sm,
  },
  column: {
    width: 240,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  rejectedColumn: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  countBadge: {
    minWidth: 24,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    alignItems: 'center',
  },
  rejectedCountBadge: {
    backgroundColor: '#E2E8F0',
    borderColor: '#CBD5E1',
  },
  countLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  columnScroll: {
    height: 520,
  },
  columnContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: spacing.xs,
  },
});
