export enum CompanyStatus {
  Interested = 'interested',
  Applied = 'applied',
  Screening = 'screening',
  Interview = 'interview',
  Offer = 'offer',
  Rejected = 'rejected',
}

export interface Company {
  id: string;
  userId: string;
  name: string;
  status: CompanyStatus;
  priority: number;
  notes?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}
