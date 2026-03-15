export interface EmailListItem {
  id: string;
  message_id: string;
  subject: string;
  sender: string;
  sender_email: string;
  received_at: string | null;
  company_name: string | null;
}

export interface EmailListResponse {
  items: EmailListItem[];
}
