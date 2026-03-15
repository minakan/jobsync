export enum CompanyStatus {
  Interested = 'interested',
  Applied = 'applied',
  Screening = 'screening',
  Interview = 'interview',
  Offer = 'offer',
  Rejected = 'rejected',
}

export interface StatusHistoryEntry {
  status: CompanyStatus;
  changed_at: string;
  note?: string | null;
}

export interface Company {
  id: string;
  userId: string;
  name: string;
  status: CompanyStatus;
  priority: number;
  notes?: string | null;
  note?: string | null;
  status_history: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
