import { HealthResponseSchema, type HealthResponse } from '@nutrikids/shared';
import { Platform } from 'react-native';

function resolveDefaultApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) {
    if (Platform.OS === 'android' && configured.includes('localhost')) {
      return configured.replace('localhost', '10.0.2.2');
    }
    return configured;
  }

  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export const API_BASE_URL = resolveDefaultApiUrl();

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    headers: { Accept: 'application/json' },
  });

  const data: unknown = await response.json();
  return HealthResponseSchema.parse(data);
}
