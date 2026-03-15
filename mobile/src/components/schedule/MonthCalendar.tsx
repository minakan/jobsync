import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SCHEDULE_TYPE_META } from './scheduleTypeMeta';

import { colors, radius, spacing } from '@/theme/tokens';
import { type Schedule } from '@/types/schedule';
import { type MonthGridCell } from '@/utils/scheduleCalendar';

interface MonthCalendarCell extends MonthGridCell {
  isToday: boolean;
  isSelected: boolean;
}

interface MonthCalendarProps {
  focusedMonth: Date;
  cells: MonthCalendarCell[];
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onLongPressCell: (cell: MonthCalendarCell) => void;
}

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

const toBannerText = (schedule: Schedule): string => {
  const trimmed = schedule.title.trim();
  if (!trimmed) {
    return SCHEDULE_TYPE_META[schedule.type].shortLabel;
  }

  if (trimmed.length <= 8) {
    return trimmed;
  }

  return `${trimmed.slice(0, 8)}…`;
};

export const MonthCalendar = ({
  focusedMonth,
  cells,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onLongPressCell,
}: MonthCalendarProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.navRow}>
        <Pressable style={styles.navButton} onPress={onPrevMonth}>
          <Text style={styles.navLabel}>前月</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{format(focusedMonth, 'yyyy年M月', { locale: ja })}</Text>
        <Pressable style={styles.navButton} onPress={onNextMonth}>
          <Text style={styles.navLabel}>次月</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const visibleSchedules = cell.schedules.slice(0, 2);
          const extraCount = cell.schedules.length - visibleSchedules.length;

          return (
            <Pressable
              key={cell.key}
              style={[
                styles.cell,
                !cell.isCurrentMonth && styles.otherMonthCell,
                cell.isToday && styles.todayCell,
                cell.isSelected && styles.selectedCell,
              ]}
              onPress={() => onSelectDate(cell.date)}
              onLongPress={() => onLongPressCell(cell)}
              delayLongPress={280}
            >
              <Text
                style={[
                  styles.dayNumber,
                  !cell.isCurrentMonth && styles.otherMonthText,
                  cell.isSelected && styles.selectedText,
                ]}
              >
                {format(cell.date, 'd')}
              </Text>

              <View style={styles.bannerStack}>
                {visibleSchedules.map((schedule) => {
                  const typeMeta = SCHEDULE_TYPE_META[schedule.type];

                  return (
                    <View
                      key={schedule.id}
                      style={[styles.banner, { backgroundColor: typeMeta.soft, borderColor: typeMeta.color }]}
                    >
                      <Text style={[styles.bannerText, { color: typeMeta.color }]} numberOfLines={1}>
                        {toBannerText(schedule)}
                      </Text>
                    </View>
                  );
                })}
                {extraCount > 0 ? <Text style={styles.moreLabel}>+{extraCount}</Text> : null}
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
  navLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.subtext,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 2,
  },
  weekdayLabel: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.subtext,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: colors.border,
  },
  cell: {
    width: '14.2857%',
    minHeight: 86,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 3,
    paddingTop: 4,
    paddingBottom: 3,
    backgroundColor: colors.surface,
    gap: 3,
  },
  otherMonthCell: {
    backgroundColor: colors.surfaceMuted,
  },
  todayCell: {
    backgroundColor: colors.primarySoft,
  },
  selectedCell: {
    borderColor: colors.primary,
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  otherMonthText: {
    color: colors.muted,
  },
  selectedText: {
    color: colors.primaryStrong,
  },
  bannerStack: {
    flex: 1,
    gap: 2,
  },
  banner: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  bannerText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  moreLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.subtext,
  },
});
