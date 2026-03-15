import { StyleSheet, Text, View } from 'react-native';

import { CompanyStatus } from '../../types/company';
import { colors, radius } from '@/theme/tokens';

interface StatusBadgeProps {
  status: CompanyStatus;
}

export const STATUS_CONFIG: Record<CompanyStatus, { label: string; color: string }> = {
  [CompanyStatus.Interested]: { label: '興味あり', color: colors.muted },
  [CompanyStatus.Applied]: { label: '応募済み', color: colors.primaryStrong },
  [CompanyStatus.Screening]: { label: '書類選考中', color: '#7C3AED' },
  [CompanyStatus.Interview]: { label: '面接中', color: '#D97706' },
  [CompanyStatus.Offer]: { label: '内定', color: colors.success },
  [CompanyStatus.Rejected]: { label: '見送り', color: colors.danger },
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = STATUS_CONFIG[status];

  return (
    <View style={[styles.badge, { backgroundColor: `${config.color}1A`, borderColor: `${config.color}4D` }]}>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.round,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
