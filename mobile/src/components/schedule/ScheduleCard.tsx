import { differenceInHours, format, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { CountdownTimer } from './CountdownTimer';

import { type Schedule, type ScheduleType } from '../../types/schedule';

interface ScheduleCardProps {
  schedule: Schedule;
  showCountdown?: boolean;
}

const TYPE_STYLES: Record<ScheduleType, { label: string; color: string }> = {
  es_deadline: { label: 'ES締切', color: '#EF4444' },
  interview: { label: '面接', color: '#4F46E5' },
  exam: { label: '試験', color: '#F97316' },
  event: { label: 'イベント', color: '#10B981' },
};

export const ScheduleCard = ({ schedule, showCountdown = true }: ScheduleCardProps) => {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const typeStyle = TYPE_STYLES[schedule.type];

  const scheduledDate = parseISO(schedule.scheduledAt);
  const isDateValid = isValid(scheduledDate);
  const hoursToEvent = isDateValid ? differenceInHours(scheduledDate, new Date()) : -1;
  const shouldShowCountdown = showCountdown && isDateValid && hoursToEvent <= 72 && hoursToEvent >= 0;

  return (
    <View
      style={[
        styles.card,
        {
          borderLeftColor: typeStyle.color,
          backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
          borderColor: isDarkMode ? '#374151' : '#E5E7EB',
        },
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.companyName, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>
          {schedule.companyName}
        </Text>
        <View style={[styles.typeBadge, { backgroundColor: `${typeStyle.color}1A` }]}>
          <Text style={[styles.typeLabel, { color: typeStyle.color }]}>{typeStyle.label}</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: isDarkMode ? '#E5E7EB' : '#374151' }]}>{schedule.title}</Text>

      <Text style={[styles.dateLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
        {isDateValid
          ? format(scheduledDate, 'M月d日(E) HH:mm', { locale: ja })
          : '日時が不正です'}
      </Text>

      {shouldShowCountdown ? <CountdownTimer scheduledAt={schedule.scheduledAt} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    gap: 8,
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
    flex: 1,
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
});
