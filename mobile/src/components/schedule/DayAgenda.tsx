import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { StyleSheet, Text, View } from 'react-native';

import { ScheduleCard } from './ScheduleCard';

import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing } from '@/theme/tokens';
import { type Schedule } from '@/types/schedule';

interface DayAgendaProps {
  date: Date;
  schedules: Schedule[];
  emptyTitle: string;
  emptyDescription: string;
  onLongPressSchedule: (schedule: Schedule) => void;
}

export const DayAgenda = ({
  date,
  schedules,
  emptyTitle,
  emptyDescription,
  onLongPressSchedule,
}: DayAgendaProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.dateTitle}>{format(date, 'yyyy年M月d日(E)', { locale: ja })}</Text>
        <Text style={styles.countLabel}>{schedules.length}件</Text>
      </View>

      {schedules.length === 0 ? (
        <AppCard>
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </AppCard>
      ) : (
        <View style={styles.list}>
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onLongPress={() => onLongPressSchedule(schedule)}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  countLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.subtext,
  },
  list: {
    gap: spacing.sm,
  },
});
