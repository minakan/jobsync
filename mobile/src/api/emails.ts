import { apiClient } from './client';
import { type EmailListResponse } from '../types/email';

export interface FetchEmailsParams {
  limit?: number;
  offset?: number;
}

export interface SyncEmailsResponse {
  task_id: string;
  status: string;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const emailQueryKeys = {
  all: ['emails'] as const,
  list: (params?: FetchEmailsParams) =>
    [
      'emails',
      'list',
      params?.limit ?? DEFAULT_LIMIT,
      params?.offset ?? DEFAULT_OFFSET,
    ] as const,
};

export const fetchEmails = async (params?: FetchEmailsParams): Promise<EmailListResponse> => {
  const response = await apiClient.get<EmailListResponse>('/emails', {
    params: {
      limit: params?.limit,
      offset: params?.offset,
    },
  });
  return response.data;
};

export const syncEmails = async (): Promise<SyncEmailsResponse> => {
  const response = await apiClient.post<SyncEmailsResponse>('/emails/sync');
  return response.data;
};

export const emailsApi = {
  sync: syncEmails,
  list: async (params?: FetchEmailsParams) => {
    const response = await fetchEmails(params);
    return response.items;
  },
};
