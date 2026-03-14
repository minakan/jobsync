import { addDays, endOfWeek, format, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SCHEDULE_TYPE_META } from './scheduleTypeMeta';

import { colors, radius, spacing } from '@/theme/tokens';
import { type Schedule } from '@/types/schedule';
import { WEEK_STARTS_ON, toDateKey } from '@/utils/scheduleCalendar';

interface WeekStripProps {
  weekStart: Date;
  selectedDate: Date;
  dayMap: Map<string, Schedule[]>;
  onSelectDate: (date: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

export const WeekStrip = ({
  weekStart,
  selectedDate,
  dayMap,
  onSelectDate,
  onPrevWeek,
  onNextWeek,
}: WeekStripProps) => {
  const selectedKey = toDateKey(selectedDate);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: WEEK_STARTS_ON });
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <View style={styles.container}>
      <View style={styles.navRow}>
        <Pressable style={styles.navButton} onPress={onPrevWeek}>
          <Text style={styles.navButtonLabel}>前週</Text>
        </Pressable>
        <Text style={styles.rangeLabel}>
          {format(weekStart, 'M/d', { locale: ja })} - {format(weekEnd, 'M/d', { locale: ja })}
        </Text>
        <Pressable style={styles.navButton} onPress={onNextWeek}>
          <Text style={styles.navButtonLabel}>次週</Text>
        </Pressable>
      </View>

      <View style={styles.daysRow}>
        {days.map((day) => {
          const dayKey = toDateKey(day);
          const daySchedules = dayMap.get(dayKey) ?? [];
          const isSelected = selectedKey === dayKey;
          const isCurrentDay = isToday(day);
          const dotColors = [...new Set(daySchedules.map((schedule) => SCHEDULE_TYPE_META[schedule.type].color))].slice(
            0,
            2,
          );

          return (
            <Pressable
              key={dayKey}
              style={[
                styles.dayCell,
                isCurrentDay && styles.todayCell,
                isSelected && styles.selectedCell,
              ]}
              onPress={() => onSelectDate(day)}
            >
              <Text style={[styles.dayOfWeek, isSelected && styles.selectedText]}>
                {format(day, 'EEEEE', { locale: ja })}
              </Text>
              <Text style={[styles.dayNumber, isSelected && styles.selectedText]}>{format(day, 'd')}</Text>
              <Text style={[styles.countLabel, isSelected && styles.selectedText]}>
                {daySchedules.length > 0 ? `${daySchedules.length}件` : '0件'}
              </Text>
              <View style={styles.dotRow}>
                {dotColors.map((color) => (
                  <View key={color} style={[styles.dot, { backgroundColor: color }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  navButton: {
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.subtext,
  },
  rangeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCell: {
    flex: 1,
    minHeight: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 3,
  },
  todayCell: {
    backgroundColor: colors.primarySoft,
  },
  selectedCell: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  dayOfWeek: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.subtext,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  countLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  selectedText: {
    color: '#FFFFFF',
  },
  dotRow: {
    minHeight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.round,
  },
});
