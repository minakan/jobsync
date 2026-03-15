import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Company } from '@/types/company';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

interface Props {
  company: Company;
  onPress: () => void;
}

const clampPriority = (value: number): number => {
  return Math.max(1, Math.min(5, Math.round(value)));
};

const getLatestStatusChangedAt = (company: Company): string => {
  let latestTimestamp = 0;
  let latestChangedAt = '';

  for (const history of company.status_history ?? []) {
    const timestamp = new Date(history.changed_at).getTime();
    if (!Number.isNaN(timestamp) && timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestChangedAt = history.changed_at;
    }
  }

  return latestChangedAt;
};

const formatChangedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`;
};

export const KanbanCard = ({ company, onPress }: Props) => {
  const dots = '●'.repeat(clampPriority(company.priority));
  const changedAt = formatChangedAt(getLatestStatusChangedAt(company));

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <Text style={styles.name} numberOfLines={1}>
        {company.name}
      </Text>

      <View style={styles.priorityRow}>
        <Text style={styles.priorityLabel}>優先度</Text>
        <Text style={styles.priorityDots}>{dots}</Text>
      </View>

      <Text style={styles.changedAt}>更新 {changedAt}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    ...shadow.card,
  },
  cardPressed: {
    opacity: 0.85,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  priorityLabel: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
  priorityDots: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  changedAt: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
});
