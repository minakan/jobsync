import { apiClient } from './client';

import { type Schedule } from '../types/schedule';

interface ListResponse<T> {
  items: T[];
}

const normalizeList = <T>(payload: T[] | ListResponse<T>): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.items;
};

export const scheduleQueryKeys = {
  all: ['schedules'] as const,
};

export const fetchSchedules = async (): Promise<Schedule[]> => {
  const response = await apiClient.get<Schedule[] | ListResponse<Schedule>>('/schedules');
  return normalizeList(response.data);
};

export const triggerEmailSyncRequest = async (): Promise<void> => {
  await apiClient.post('/emails/sync');
};
