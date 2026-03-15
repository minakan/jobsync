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
  start_at?: string;
  startAt?: string;
  end_at?: string;
  endAt?: string;
  is_all_day?: boolean;
  isAllDay?: boolean;
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
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  title: string;
  notes?: string;
  deadlineDate?: string;
}

export interface UpdateSchedulePayload {
  type?: ScheduleType;
  title?: string;
  startAt?: string;
  endAt?: string;
  isAllDay?: boolean;
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
  const startAt = schedule.startAt ?? schedule.start_at ?? schedule.scheduledAt ?? schedule.scheduled_at ?? '';
  const endAt = schedule.endAt ?? schedule.end_at ?? startAt;

  return {
    id: schedule.id,
    userId: schedule.userId ?? schedule.user_id ?? '',
    companyId: schedule.companyId ?? schedule.company_id ?? null,
    companyName: schedule.companyName ?? schedule.company_name ?? '企業未設定',
    title: schedule.title,
    type: normalizeScheduleType(schedule.type),
    startAt,
    endAt,
    isAllDay: Boolean(schedule.isAllDay ?? schedule.is_all_day ?? false),
    scheduledAt: startAt,
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
    start_at: payload.startAt,
    end_at: payload.endAt,
    is_all_day: payload.isAllDay,
    scheduled_at: payload.startAt,
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
    start_at?: string;
    end_at?: string;
    is_all_day?: boolean;
    scheduled_at?: string;
    company_id?: string;
  } = {};

  if (payload.type !== undefined) {
    updatePayload.type = payload.type;
  }
  if (payload.title !== undefined) {
    updatePayload.title = payload.title;
  }
  if (payload.startAt !== undefined) {
    updatePayload.start_at = payload.startAt;
    updatePayload.scheduled_at = payload.startAt;
  }
  if (payload.endAt !== undefined) {
    updatePayload.end_at = payload.endAt;
  }
  if (payload.isAllDay !== undefined) {
    updatePayload.is_all_day = payload.isAllDay;
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
