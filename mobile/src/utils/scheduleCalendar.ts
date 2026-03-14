import {
  addDays,
  format,
  isSameMonth,
  isThisWeek,
  isToday,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import { type Schedule } from '@/types/schedule';

export const WEEK_STARTS_ON = 1 as const;

export type ScheduleViewMode = 'list' | 'day' | 'week' | 'month';

export interface ScheduleSection {
  title: string;
  data: Schedule[];
}

export interface WeekBucket {
  key: string;
  startDate: Date;
  schedules: Schedule[];
}

export interface MonthGridCell {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
  schedules: Schedule[];
}

export const parseScheduleDate = (value: string): Date | null => {
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    return null;
  }

  return parsed;
};

export const toDateKey = (value: Date): string => {
  return format(startOfDay(value), 'yyyy-MM-dd');
};

export const sortByScheduledAt = (left: Schedule, right: Schedule): number => {
  const leftDate = parseScheduleDate(left.scheduledAt);
  const rightDate = parseScheduleDate(right.scheduledAt);

  if (!leftDate && !rightDate) {
    return 0;
  }

  if (!leftDate) {
    return 1;
  }

  if (!rightDate) {
    return -1;
  }

  return leftDate.getTime() - rightDate.getTime();
};

export const groupSchedulesBySections = (schedules: Schedule[]): ScheduleSection[] => {
  const today: Schedule[] = [];
  const thisWeek: Schedule[] = [];
  const later: Schedule[] = [];

  for (const schedule of schedules) {
    const scheduleDate = parseScheduleDate(schedule.scheduledAt);

    if (!scheduleDate) {
      later.push(schedule);
      continue;
    }

    if (isToday(scheduleDate)) {
      today.push(schedule);
      continue;
    }

    if (isThisWeek(scheduleDate, { weekStartsOn: WEEK_STARTS_ON })) {
      thisWeek.push(schedule);
      continue;
    }

    later.push(schedule);
  }

  return [
    { title: '今日', data: [...today].sort(sortByScheduledAt) },
    { title: '今週', data: [...thisWeek].sort(sortByScheduledAt) },
    { title: 'それ以降', data: [...later].sort(sortByScheduledAt) },
  ];
};

export const buildScheduleDayMap = (schedules: Schedule[]): Map<string, Schedule[]> => {
  const dayMap = new Map<string, Schedule[]>();

  for (const schedule of schedules) {
    const scheduleDate = parseScheduleDate(schedule.scheduledAt);
    if (!scheduleDate) {
      continue;
    }

    const dayKey = toDateKey(scheduleDate);
    const current = dayMap.get(dayKey);

    if (current) {
      current.push(schedule);
      continue;
    }

    dayMap.set(dayKey, [schedule]);
  }

  for (const [key, daySchedules] of dayMap.entries()) {
    dayMap.set(key, [...daySchedules].sort(sortByScheduledAt));
  }

  return dayMap;
};

export const buildWeekBuckets = (dayMap: Map<string, Schedule[]>): WeekBucket[] => {
  const weekMap = new Map<string, WeekBucket>();

  for (const [dayKey, daySchedules] of dayMap.entries()) {
    const dayDate = parseISO(dayKey);
    if (!isValid(dayDate)) {
      continue;
    }

    const weekStart = startOfWeek(dayDate, { weekStartsOn: WEEK_STARTS_ON });
    const weekKey = toDateKey(weekStart);
    const current = weekMap.get(weekKey);

    if (current) {
      current.schedules.push(...daySchedules);
      continue;
    }

    weekMap.set(weekKey, {
      key: weekKey,
      startDate: weekStart,
      schedules: [...daySchedules],
    });
  }

  return [...weekMap.values()]
    .map((bucket) => ({
      ...bucket,
      schedules: [...bucket.schedules].sort(sortByScheduledAt),
    }))
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
};

export const buildMonthGrid = (
  focusedMonth: Date,
  dayMap: Map<string, Schedule[]>,
): MonthGridCell[] => {
  const monthStart = startOfMonth(focusedMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dayKey = toDateKey(date);

    return {
      key: dayKey,
      date,
      isCurrentMonth: isSameMonth(date, monthStart),
      schedules: dayMap.get(dayKey) ?? [],
    };
  });
};
