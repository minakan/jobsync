import { differenceInHours, format, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CountdownTimer } from './CountdownTimer';

import { type Schedule, type ScheduleType } from '../../types/schedule';
import { colors, radius } from '@/theme/tokens';

interface ScheduleCardProps {
  schedule: Schedule;
  showCountdown?: boolean;
  onLongPress?: () => void;
}

const TYPE_STYLES: Record<ScheduleType, { label: string; color: string; soft: string }> = {
  es_deadline: { label: 'ES締切', color: '#DC2626', soft: '#FEE2E2' },
  interview: { label: '面接', color: '#1D4ED8', soft: '#DBEAFE' },
  exam: { label: '試験', color: '#C2410C', soft: '#FFEDD5' },
  event: { label: 'イベント', color: '#15803D', soft: '#DCFCE7' },
};

export const ScheduleCard = ({ schedule, showCountdown = true, onLongPress }: ScheduleCardProps) => {
  const typeStyle = TYPE_STYLES[schedule.type];

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
