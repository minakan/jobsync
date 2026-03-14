import { differenceInHours, format, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CountdownTimer } from './CountdownTimer';
import { SCHEDULE_TYPE_META } from './scheduleTypeMeta';

import { type Schedule } from '../../types/schedule';
import { colors, radius } from '@/theme/tokens';

interface ScheduleCardProps {
  schedule: Schedule;
  showCountdown?: boolean;
  onLongPress?: () => void;
}

export const ScheduleCard = ({ schedule, showCountdown = true, onLongPress }: ScheduleCardProps) => {
  const typeStyle = SCHEDULE_TYPE_META[schedule.type];

  const scheduledDate = parseISO(schedule.scheduledAt);
  const isDateValid = isValid(scheduledDate);
  const hoursToEvent = isDateValid ? differenceInHours(scheduledDate, new Date()) : -1;
  const shouldShowCountdown = showCountdown && isDateValid && hoursToEvent <= 72 && hoursToEvent >= 0;

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={280}>
      {({ pressed }) => (
        <View style={[styles.card, { borderLeftColor: typeStyle.color }, pressed && styles.pressed]}>
          <View style={styles.row}>
            <Text style={styles.companyName} numberOfLines={1}>
              {schedule.companyName}
            </Text>
            <View style={[styles.typeBadge, { backgroundColor: typeStyle.soft }]}> 
              <Text style={[styles.typeLabel, { color: typeStyle.color }]}>{typeStyle.label}</Text>
            </View>
          </View>

          <Text style={styles.title}>{schedule.title}</Text>

          <Text style={styles.dateLabel}>
            {isDateValid ? format(scheduledDate, 'M月d日(E) HH:mm', { locale: ja }) : '日時が不正です'}
          </Text>

          {shouldShowCountdown ? <CountdownTimer scheduledAt={schedule.scheduledAt} /> : null}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 8,
  },
  pressed: {
    opacity: 0.88,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  companyName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  typeBadge: {
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.subtext,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
});
