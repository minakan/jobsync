import { apiClient } from './client';

import { type Company } from '../types/company';

interface ListResponse<T> {
  items: T[];
}

const normalizeList = <T>(payload: T[] | ListResponse<T>): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.items;
};

export const companyQueryKeys = {
  all: ['companies'] as const,
};

export const fetchCompanies = async (): Promise<Company[]> => {
  const response = await apiClient.get<Company[] | ListResponse<Company>>('/companies');
  return normalizeList(response.data);
};
