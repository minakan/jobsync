import { apiClient } from './client';

export interface ForwardingAddressResponse {
  forwarding_email: string;
}

export const usersApi = {
  getForwardingAddress: async (): Promise<ForwardingAddressResponse> => {
    const response = await apiClient.get<ForwardingAddressResponse>(
      '/users/me/forwarding-address',
    );
    return response.data;
  },
  updateFCMToken: async (token: string): Promise<void> => {
    await apiClient.patch('/users/me/fcm-token', { fcm_token: token });
  },
};
