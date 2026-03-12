import { apiClient } from './client';

export interface EmailListItem {
  id: string;
  message_id: string;
  subject: string;
  sender: string;
  sender_email: string;
  received_at: string;
  company_name: string | null;
}

export interface SyncEmailsResponse {
  task_id: string;
  status: string;
}

interface EmailListResponse {
  items: EmailListItem[];
}

export const emailsApi = {
  sync: async (): Promise<SyncEmailsResponse> => {
    const response = await apiClient.post<SyncEmailsResponse>('/emails/sync');
    return response.data;
  },

  list: async (): Promise<EmailListItem[]> => {
    const response = await apiClient.get<EmailListResponse>('/emails');
    return response.data.items;
  },
};
