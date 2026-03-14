import { type ScheduleType } from '@/types/schedule';

export interface ScheduleTypeMeta {
  label: string;
  shortLabel: string;
  color: string;
  soft: string;
}

export const SCHEDULE_TYPE_META: Record<ScheduleType, ScheduleTypeMeta> = {
  es_deadline: { label: 'ES締切', shortLabel: 'ES', color: '#DC2626', soft: '#FEE2E2' },
  interview: { label: '面接', shortLabel: '面', color: '#1D4ED8', soft: '#DBEAFE' },
  exam: { label: '試験', shortLabel: '試', color: '#C2410C', soft: '#FFEDD5' },
  event: { label: 'イベント', shortLabel: 'イ', color: '#15803D', soft: '#DCFCE7' },
};
