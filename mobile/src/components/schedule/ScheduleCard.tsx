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

  const startDate = parseISO(schedule.startAt || schedule.scheduledAt);
  const endDate = parseISO(schedule.endAt || schedule.startAt || schedule.scheduledAt);
  const isStartValid = isValid(startDate);
  const isEndValid = isValid(endDate);
  const countdownTarget = schedule.isAllDay ? endDate : startDate;
  const isDateValid = isStartValid && isEndValid;
  const hoursToEvent = isDateValid ? differenceInHours(countdownTarget, new Date()) : -1;
  const shouldShowCountdown = showCountdown && isDateValid && hoursToEvent <= 72 && hoursToEvent >= 0;

  const dateLabel = schedule.isAllDay
    ? isStartValid
      ? `${format(startDate, 'M月d日(E)', { locale: ja })} 終日`
      : '日時が不正です'
    : isDateValid
      ? `${format(startDate, 'M月d日(E) HH:mm', { locale: ja })} - ${format(endDate, 'HH:mm', { locale: ja })}`
      : '日時が不正です';

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

          <Text style={styles.dateLabel}>{dateLabel}</Text>

          {shouldShowCountdown ? (
            <CountdownTimer scheduledAt={schedule.isAllDay ? schedule.endAt : schedule.startAt} />
          ) : null}
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
