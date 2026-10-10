import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useCrmMetrics() {
  return useQuery({ queryKey: ['crm-metrics'], queryFn: () => api.getCrmMetrics() });
}
