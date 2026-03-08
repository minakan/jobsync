import { apiClient } from './client';

import { CompanyStatus, type Company } from '../types/company';

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
}

export interface CreateCompanyPayload {
  name: string;
  status: CompanyStatus;
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
  return {
    id: company.id,
    userId: company.userId ?? company.user_id ?? '',
    name: company.name,
    status: normalizeStatus(company.status),
    priority: company.priority ?? 3,
    notes: company.notes ?? company.note ?? null,
    note: company.note ?? company.notes ?? null,
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
