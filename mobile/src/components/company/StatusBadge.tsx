import { StyleSheet, Text, View } from 'react-native';

import { CompanyStatus } from '../../types/company';

interface StatusBadgeProps {
  status: CompanyStatus;
}

export const STATUS_CONFIG: Record<CompanyStatus, { label: string; color: string }> = {
  [CompanyStatus.Interested]: { label: '興味あり', color: '#6B7280' },
  [CompanyStatus.Applied]: { label: '応募済み', color: '#2563EB' },
  [CompanyStatus.Screening]: { label: '書類選考中', color: '#8B5CF6' },
  [CompanyStatus.Interview]: { label: '面接中', color: '#F59E0B' },
  [CompanyStatus.Offer]: { label: '内定', color: '#10B981' },
  [CompanyStatus.Rejected]: { label: '見送り', color: '#EF4444' },
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = STATUS_CONFIG[status];

  return (
    <View style={[styles.badge, { backgroundColor: `${config.color}1A` }]}>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
