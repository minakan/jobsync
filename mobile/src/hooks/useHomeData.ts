import { useMemo } from 'react';
import { differenceInHours, isToday, isValid, parseISO } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { companyQueryKeys, fetchCompanies } from '../api/companies';
import { fetchSchedules, scheduleQueryKeys, triggerEmailSyncRequest } from '../api/schedules';
import { type Schedule } from '../types/schedule';

const parseDate = (value: string): Date | null => {
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
};

const sortByScheduledAt = (left: Schedule, right: Schedule): number => {
  const leftDate = parseDate(left.startAt || left.scheduledAt);
  const rightDate = parseDate(right.startAt || right.scheduledAt);

  if (!leftDate || !rightDate) {
    return 0;
  }

  return leftDate.getTime() - rightDate.getTime();
};

export const useHomeData = () => {
  const queryClient = useQueryClient();

  const schedulesQuery = useQuery({
    queryKey: scheduleQueryKeys.all,
    queryFn: fetchSchedules,
  });

  const companiesQuery = useQuery({
    queryKey: companyQueryKeys.all,
    queryFn: fetchCompanies,
  });

  const syncMutation = useMutation({
    mutationFn: triggerEmailSyncRequest,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: companyQueryKeys.all }),
      ]);
    },
  });

  const schedules = schedulesQuery.data ?? [];

  const todaySchedules = useMemo<Schedule[]>(() => {
    return schedules
      .filter((schedule) => {
        const scheduledDate = parseDate(schedule.startAt || schedule.scheduledAt);
        return Boolean(scheduledDate && isToday(scheduledDate));
      })
      .sort(sortByScheduledAt);
  }, [schedules]);

  const upcomingDeadlines = useMemo<Schedule[]>(() => {
    const now = new Date();

    return schedules
      .filter((schedule) => {
        if (schedule.type !== 'es_deadline') {
          return false;
        }

        const startDate = parseDate(schedule.startAt || schedule.scheduledAt);
        if (!startDate) {
          return false;
        }

        const targetDate = schedule.isAllDay ? parseDate(schedule.endAt) ?? startDate : startDate;
        const hoursLeft = differenceInHours(targetDate, now);
        return hoursLeft >= 0 && hoursLeft <= 72;
      })
      .sort(sortByScheduledAt);
  }, [schedules]);

  const companySummary = useMemo<Record<string, number>>(() => {
    return (companiesQuery.data ?? []).reduce<Record<string, number>>((summary, company) => {
      summary[company.status] = (summary[company.status] ?? 0) + 1;
      return summary;
    }, {});
  }, [companiesQuery.data]);

  const triggerSync = async (): Promise<void> => {
    await syncMutation.mutateAsync();
  };

  const refreshHomeData = async (): Promise<void> => {
    await Promise.all([schedulesQuery.refetch(), companiesQuery.refetch()]);
  };

  return {
    todaySchedules,
    upcomingDeadlines,
    companySummary,
    isSyncing: syncMutation.isPending,
    triggerSync,
    isLoading: schedulesQuery.isLoading || companiesQuery.isLoading,
    isRefreshing: schedulesQuery.isRefetching || companiesQuery.isRefetching,
    refreshHomeData,
  };
};
