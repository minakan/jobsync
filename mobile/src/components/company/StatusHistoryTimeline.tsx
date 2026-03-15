import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type StatusHistoryEntry } from '@/types/company';
import { STATUS_CONFIG } from '@/components/company/StatusBadge';
import { colors, spacing } from '@/theme/tokens';

interface Props {
  history: StatusHistoryEntry[];
}

const formatHistoryDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes}`;
};

export const StatusHistoryTimeline = ({ history }: Props) => {
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      return new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime();
    });
  }, [history]);

  if (sortedHistory.length === 0) {
    return <Text style={styles.emptyText}>変更履歴がありません</Text>;
  }

  return (
    <View style={styles.container}>
      {sortedHistory.map((entry, index) => {
        const statusConfig = STATUS_CONFIG[entry.status];
        const isLast = index === sortedHistory.length - 1;

        return (
          <View key={`${entry.status}-${entry.changed_at}-${index}`} style={styles.row}>
            <View style={styles.trackColumn}>
              <View style={[styles.dot, { backgroundColor: statusConfig.color }]} />
              {!isLast ? <View style={styles.line} /> : null}
            </View>

            <View style={styles.content}>
              <View style={styles.headingRow}>
                <Text style={[styles.statusLabel, { color: statusConfig.color }]}>
                  {statusConfig.label}
                </Text>
                <Text style={styles.dateText}>{formatHistoryDate(entry.changed_at)}</Text>
              </View>
              {entry.note ? <Text style={styles.noteText}>{entry.note}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  trackColumn: {
    width: 16,
    alignItems: 'center',
    minHeight: 42,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: 4,
    backgroundColor: colors.borderStrong,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
    paddingBottom: 2,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  dateText: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
  noteText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyText: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
});
