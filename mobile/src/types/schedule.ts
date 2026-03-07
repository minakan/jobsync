export type ScheduleType = 'es_deadline' | 'interview' | 'exam' | 'event';

export interface Schedule {
  id: string;
  userId: string;
  companyId: string | null;
  companyName: string;
  title: string;
  type: ScheduleType;
  scheduledAt: string;
  location?: string | null;
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
}
