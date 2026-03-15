import { apiClient } from './client';

import { CompanyStatus, type Company, type StatusHistoryEntry } from '../types/company';

interface ListResponse<T> {
  items: T[];
}

type CompanyApiStatus =
  | CompanyStatus
  | 'interview1'
  | 'interview2'
  | 'final'
  | 'offered'
  | 'withdrawn';

interface CompanyApiModel {
  id: string;
  user_id?: string;
  userId?: string;
  name: string;
  status: CompanyApiStatus;
  priority?: number;
  notes?: string | null;
  note?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  status_history?: CompanyApiStatusHistoryEntry[];
  statusHistory?: CompanyApiStatusHistoryEntry[];
}

interface CompanyApiStatusHistoryEntry {
  status?: CompanyApiStatus;
  from?: CompanyApiStatus;
  to?: CompanyApiStatus;
  changed_at?: string;
  changedAt?: string;
  note?: string | null;
}

export interface CreateCompanyPayload {
  name: string;
  status: CompanyStatus;
  priority?: number;
  notes?: string;
}

export interface UpdateCompanyPayload {
  status?: CompanyStatus;
  priority?: number;
  notes?: string;
}

const normalizeList = <T>(payload: T[] | ListResponse<T>): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.items;
};

const normalizeStatus = (status: CompanyApiStatus): CompanyStatus => {
  switch (status) {
    case CompanyStatus.Interested:
    case CompanyStatus.Applied:
    case CompanyStatus.Screening:
    case CompanyStatus.Interview:
    case CompanyStatus.Offer:
    case CompanyStatus.Rejected:
      return status;
    case 'interview1':
    case 'interview2':
    case 'final':
      return CompanyStatus.Interview;
    case 'offered':
      return CompanyStatus.Offer;
    case 'withdrawn':
      return CompanyStatus.Rejected;
    default:
      return CompanyStatus.Interested;
  }
};

const normalizeCompany = (company: CompanyApiModel): Company => {
  const rawHistory = company.status_history ?? company.statusHistory ?? [];
  const status_history: StatusHistoryEntry[] = rawHistory.map((entry) => {
    const rawStatus =
      entry.status ?? entry.to ?? entry.from ?? CompanyStatus.Interested;

    return {
      status: normalizeStatus(rawStatus),
      changed_at: entry.changed_at ?? entry.changedAt ?? '',
      note: entry.note ?? null,
    };
  });

  return {
    id: company.id,
    userId: company.userId ?? company.user_id ?? '',
    name: company.name,
    status: normalizeStatus(company.status),
    priority: company.priority ?? 3,
    notes: company.notes ?? company.note ?? null,
    note: company.note ?? company.notes ?? null,
    status_history,
    createdAt: company.createdAt ?? company.created_at ?? '',
    updatedAt: company.updatedAt ?? company.updated_at ?? '',
  };
};

export const companyQueryKeys = {
  all: ['companies'] as const,
};

export const fetchCompanies = async (): Promise<Company[]> => {
  const response = await apiClient.get<CompanyApiModel[] | ListResponse<CompanyApiModel>>('/companies');
  return normalizeList(response.data).map(normalizeCompany);
};

export const createCompany = async (payload: CreateCompanyPayload): Promise<Company> => {
  const response = await apiClient.post<CompanyApiModel>('/companies', {
    name: payload.name,
    status: payload.status,
    priority: payload.priority ?? 3,
    notes: payload.notes ?? null,
  });

  return normalizeCompany(response.data);
};

export const updateCompany = async (id: string, payload: UpdateCompanyPayload): Promise<Company> => {
  const updatePayload: {
    status?: CompanyStatus;
    priority?: number;
    notes?: string | null;
  } = {};

  if (payload.status !== undefined) {
    updatePayload.status = payload.status;
  }
  if (payload.priority !== undefined) {
    updatePayload.priority = payload.priority;
  }
  if (payload.notes !== undefined) {
    updatePayload.notes = payload.notes.trim().length > 0 ? payload.notes : null;
  }

  const response = await apiClient.patch<CompanyApiModel>(`/companies/${id}`, updatePayload);
  return normalizeCompany(response.data);
};

export const deleteCompany = async (id: string): Promise<void> => {
  await apiClient.delete(`/companies/${id}`);
};
