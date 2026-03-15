import { useMemo } from 'react';
import { addDays, endOfWeek, format, isSameDay, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SCHEDULE_TYPE_META } from './scheduleTypeMeta';

import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, radius, spacing } from '@/theme/tokens';
import { type Schedule } from '@/types/schedule';
import { parseScheduleEnd, parseScheduleStart, WEEK_STARTS_ON } from '@/utils/scheduleCalendar';

const HOURS_IN_DAY = 24;
const HOUR_HEIGHT = 56;
const GRID_HEIGHT = HOURS_IN_DAY * HOUR_HEIGHT;
const MIN_EVENT_HEIGHT = 24;
const DAY_COLUMNS = 7;

interface TimedEvent {
  schedule: Schedule;
  startMinute: number;
  endMinute: number;
}

interface PositionedTimedEvent {
  schedule: Schedule;
  top: number;
  height: number;
  column: number;
  columnCount: number;
}

interface WeekTimeGridProps {
  weekStart: Date;
  schedules: Schedule[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onLongPressSchedule: (schedule: Schedule) => void;
}

const minuteOfDay = (date: Date): number => {
  return date.getHours() * 60 + date.getMinutes();
};

const eventOrder = (left: TimedEvent, right: TimedEvent): number => {
  if (left.startMinute !== right.startMinute) {
    return left.startMinute - right.startMinute;
  }
  return left.endMinute - right.endMinute;
};

const buildPositionedEvents = (events: TimedEvent[]): PositionedTimedEvent[] => {
  if (events.length === 0) {
    return [];
  }

  const sorted = [...events].sort(eventOrder);
  const groups: TimedEvent[][] = [];
  let currentGroup: TimedEvent[] = [];
  let currentGroupEnd = -1;

  for (const event of sorted) {
    if (currentGroup.length === 0 || event.startMinute < currentGroupEnd) {
      currentGroup.push(event);
      currentGroupEnd = Math.max(currentGroupEnd, event.endMinute);
      continue;
    }

    groups.push(currentGroup);
    currentGroup = [event];
    currentGroupEnd = event.endMinute;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups.flatMap((group) => {
    const columnEndMinutes: number[] = [];
    const assignments: Array<{ event: TimedEvent; column: number }> = [];

      for (const event of group) {
        let assignedColumn = -1;

        for (let column = 0; column < columnEndMinutes.length; column += 1) {
          const endMinute = columnEndMinutes[column];
          if (endMinute !== undefined && endMinute <= event.startMinute) {
            assignedColumn = column;
            break;
          }
        }

      if (assignedColumn < 0) {
        assignedColumn = columnEndMinutes.length;
        columnEndMinutes.push(event.endMinute);
      } else {
        columnEndMinutes[assignedColumn] = event.endMinute;
      }

      assignments.push({ event, column: assignedColumn });
    }

    const columnCount = Math.max(1, columnEndMinutes.length);
    return assignments.map(({ event, column }) => {
      const durationMinutes = Math.max(15, event.endMinute - event.startMinute);
      const top = (event.startMinute / 60) * HOUR_HEIGHT;
      const height = Math.max(MIN_EVENT_HEIGHT, (durationMinutes / 60) * HOUR_HEIGHT);

      return {
        schedule: event.schedule,
        top,
        height,
        column,
        columnCount,
      };
    });
  });
};

export const WeekTimeGrid = ({
  weekStart,
  schedules,
  onPrevWeek,
  onNextWeek,
  onLongPressSchedule,
}: WeekTimeGridProps) => {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: WEEK_STARTS_ON });
  const days = useMemo(() => {
    return Array.from({ length: DAY_COLUMNS }, (_, index) => addDays(weekStart, index));
  }, [weekStart]);

  const allDayByDay = useMemo(() => {
    return days.map((day) => {
      return schedules
        .filter((schedule) => {
          if (!schedule.isAllDay) {
            return false;
          }

          const start = parseScheduleStart(schedule);
          return Boolean(start && isSameDay(start, day));
        })
        .sort((left, right) => {
          const leftStart = parseScheduleStart(left);
          const rightStart = parseScheduleStart(right);

          if (!leftStart || !rightStart) {
            return 0;
          }

          return leftStart.getTime() - rightStart.getTime();
        });
    });
  }, [days, schedules]);

  const timedByDay = useMemo(() => {
    return days.map((day) => {
      const timed = schedules.flatMap<TimedEvent>((schedule) => {
        if (schedule.isAllDay) {
          return [];
        }

        const start = parseScheduleStart(schedule);
        const end = parseScheduleEnd(schedule);
        if (!start || !end || !isSameDay(start, day)) {
          return [];
        }

        const startMinute = Math.max(0, Math.min(HOURS_IN_DAY * 60, minuteOfDay(start)));
        const endMinuteRaw = Math.max(0, Math.min(HOURS_IN_DAY * 60, minuteOfDay(end)));
        const endMinute = Math.max(startMinute + 1, endMinuteRaw);

        return [
          {
            schedule,
            startMinute,
            endMinute,
          },
        ];
      });

      return buildPositionedEvents(timed);
    });
  }, [days, schedules]);

  const hasAnySchedule = schedules.length > 0;

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

      <View style={styles.daysHeaderRow}>
        <View style={styles.timeAxisSpacer} />
        {days.map((day) => (
          <View key={day.toISOString()} style={styles.dayHeaderCell}>
            <Text style={styles.dayHeaderWeekLabel}>{format(day, 'EEEEE', { locale: ja })}</Text>
            <Text style={styles.dayHeaderDateLabel}>{format(day, 'd')}</Text>
          </View>
        ))}
      </View>

      <View style={styles.allDayRow}>
        <View style={styles.allDayLabelCell}>
          <Text style={styles.allDayLabel}>終日</Text>
        </View>
        {allDayByDay.map((daySchedules, index) => (
          <View key={`all-day-${index}`} style={styles.allDayDayCell}>
            {daySchedules.slice(0, 2).map((schedule) => (
              <Pressable
                key={schedule.id}
                style={styles.allDayChip}
                onLongPress={() => onLongPressSchedule(schedule)}
                delayLongPress={280}
              >
                <Text style={styles.allDayChipText} numberOfLines={1}>
                  {schedule.title}
                </Text>
              </Pressable>
            ))}
            {daySchedules.length > 2 ? (
              <Text style={styles.allDayMoreLabel}>+{daySchedules.length - 2}</Text>
            ) : null}
          </View>
        ))}
      </View>

      {!hasAnySchedule ? (
        <AppCard>
          <EmptyState
            title="今週の予定はありません"
            description="別の週へ移動するか、＋ボタンから予定を追加してください。"
          />
        </AppCard>
      ) : null}

      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.gridContent}>
        <View style={styles.gridFrame}>
          <View style={styles.timeAxisColumn}>
            {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
              <Text key={`hour-${hour}`} style={[styles.hourLabel, { top: hour * HOUR_HEIGHT - 7 }]}>
                {`${hour}:00`}
              </Text>
            ))}
          </View>

          <View style={styles.dayColumnsWrap}>
            {Array.from({ length: HOURS_IN_DAY + 1 }, (_, hour) => (
              <View key={`line-${hour}`} style={[styles.hourLine, { top: hour * HOUR_HEIGHT }]} />
            ))}

            <View style={styles.dayColumnsRow}>
              {timedByDay.map((dayEvents, dayIndex) => (
                <View key={`day-column-${dayIndex}`} style={styles.dayColumn}>
                  <View style={styles.dayColumnBody}>
                    {dayEvents.map((positionedEvent) => {
                      const widthPercentage = 100 / positionedEvent.columnCount;
                      const leftPercentage = positionedEvent.column * widthPercentage;
                      const scheduleTypeMeta = SCHEDULE_TYPE_META[positionedEvent.schedule.type];
                      const start = parseScheduleStart(positionedEvent.schedule) ?? parseISO(positionedEvent.schedule.startAt);
                      const end = parseScheduleEnd(positionedEvent.schedule) ?? parseISO(positionedEvent.schedule.endAt);
                      const timeLabel =
                        !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
                          ? `${format(start, 'HH:mm', { locale: ja })}-${format(end, 'HH:mm', { locale: ja })}`
                          : '--:--';

                      return (
                        <Pressable
                          key={positionedEvent.schedule.id}
                          style={[
                            styles.eventBlock,
                            {
                              top: positionedEvent.top,
                              height: positionedEvent.height,
                              left: `${leftPercentage}%`,
                              width: `${widthPercentage}%`,
                              borderColor: scheduleTypeMeta.color,
                              backgroundColor: scheduleTypeMeta.soft,
                            },
                          ]}
                          onLongPress={() => onLongPressSchedule(positionedEvent.schedule)}
                          delayLongPress={280}
                        >
                          <Text style={[styles.eventTitle, { color: scheduleTypeMeta.color }]} numberOfLines={2}>
                            {positionedEvent.schedule.title}
                          </Text>
                          <Text style={styles.eventTime} numberOfLines={1}>
                            {timeLabel}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
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
  daysHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeAxisSpacer: {
    width: 52,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  dayHeaderCell: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  dayHeaderWeekLabel: {
    color: colors.subtext,
    fontSize: 11,
    fontWeight: '700',
  },
  dayHeaderDateLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 72,
  },
  allDayLabelCell: {
    width: 52,
    borderRightWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  allDayLabel: {
    color: colors.subtext,
    fontSize: 11,
    fontWeight: '700',
  },
  allDayDayCell: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
  },
  allDayChip: {
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  allDayChipText: {
    color: colors.primaryStrong,
    fontSize: 10,
    fontWeight: '700',
  },
  allDayMoreLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  gridScroll: {
    flex: 1,
    minHeight: 420,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  gridContent: {
    minHeight: GRID_HEIGHT,
  },
  gridFrame: {
    flexDirection: 'row',
    minHeight: GRID_HEIGHT,
  },
  timeAxisColumn: {
    width: 52,
    borderRightWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  hourLabel: {
    position: 'absolute',
    right: 4,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  dayColumnsWrap: {
    flex: 1,
    position: 'relative',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  dayColumnsRow: {
    flexDirection: 'row',
    minHeight: GRID_HEIGHT,
  },
  dayColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  dayColumnBody: {
    minHeight: GRID_HEIGHT,
    position: 'relative',
  },
  eventBlock: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  eventTitle: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  eventTime: {
    marginTop: 2,
    color: colors.subtext,
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
  },
});
