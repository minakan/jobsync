import { apiClient } from './client';

import { type Schedule, type ScheduleType } from '../types/schedule';

interface ListResponse<T> {
  items: T[];
}

interface ScheduleApiModel {
  id: string;
  user_id?: string;
  userId?: string;
  company_id?: string | null;
  companyId?: string | null;
  company_name?: string | null;
  companyName?: string | null;
  title: string;
  type: string;
  scheduled_at?: string;
  scheduledAt?: string;
  location?: string | null;
  memo?: string | null;
  description?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface CreateSchedulePayload {
  companyId: string;
  type: Schedule['type'];
  scheduledAt: string;
  title: string;
  notes?: string;
  deadlineDate?: string;
}

export interface UpdateSchedulePayload {
  type?: ScheduleType;
  title?: string;
  scheduledAt?: string;
  companyId?: string;
}

const normalizeList = <T>(payload: T[] | ListResponse<T>): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.items;
};

const normalizeScheduleType = (value: string): Schedule['type'] => {
  switch (value) {
    case 'es_deadline':
    case 'interview':
    case 'exam':
    case 'event':
      return value;
    case 'webtest':
    case 'other':
      return 'event';
    default:
      return 'event';
  }
};

const normalizeSchedule = (schedule: ScheduleApiModel): Schedule => {
  return {
    id: schedule.id,
    userId: schedule.userId ?? schedule.user_id ?? '',
    companyId: schedule.companyId ?? schedule.company_id ?? null,
    companyName: schedule.companyName ?? schedule.company_name ?? '企業未設定',
    title: schedule.title,
    type: normalizeScheduleType(schedule.type),
    scheduledAt: schedule.scheduledAt ?? schedule.scheduled_at ?? '',
    location: schedule.location ?? null,
    memo: schedule.memo ?? schedule.description ?? null,
    createdAt: schedule.createdAt ?? schedule.created_at ?? '',
    updatedAt: schedule.updatedAt ?? schedule.updated_at ?? '',
  };
};

export const scheduleQueryKeys = {
  all: ['schedules'] as const,
};

export const fetchSchedules = async (): Promise<Schedule[]> => {
  const response = await apiClient.get<ScheduleApiModel[] | ListResponse<ScheduleApiModel>>('/schedules');
  return normalizeList(response.data).map(normalizeSchedule);
};

export const createSchedule = async (payload: CreateSchedulePayload): Promise<Schedule> => {
  const response = await apiClient.post<ScheduleApiModel>('/schedules', {
    company_id: payload.companyId,
    type: payload.type,
    scheduled_at: payload.scheduledAt,
    title: payload.title,
    notes: payload.notes ?? null,
    deadline_date: payload.deadlineDate ?? null,
  });

  return normalizeSchedule(response.data);
};

export const updateSchedule = async (
  id: string,
  payload: UpdateSchedulePayload,
): Promise<Schedule> => {
  const updatePayload: {
    type?: ScheduleType;
    title?: string;
    scheduled_at?: string;
    company_id?: string;
  } = {};

  if (payload.type !== undefined) {
    updatePayload.type = payload.type;
  }
  if (payload.title !== undefined) {
    updatePayload.title = payload.title;
  }
  if (payload.scheduledAt !== undefined) {
    updatePayload.scheduled_at = payload.scheduledAt;
  }
  if (payload.companyId !== undefined) {
    updatePayload.company_id = payload.companyId;
  }

  const response = await apiClient.patch<ScheduleApiModel>(`/schedules/${id}`, updatePayload);
  return normalizeSchedule(response.data);
};

export const deleteSchedule = async (id: string): Promise<void> => {
  await apiClient.delete(`/schedules/${id}`);
};

export const triggerEmailSyncRequest = async (): Promise<void> => {
  await apiClient.post('/emails/sync');
};
