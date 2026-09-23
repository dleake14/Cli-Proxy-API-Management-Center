/**
 * 配置相关 API
 */

import { apiClient } from './client';
import type { Config } from '@/types';
import { normalizeConfigResponse } from './transformers';

export const configApi = {
  /**
   * 获取配置（会进行字段规范化）
   */
  async getConfig(): Promise<Config> {
    const raw = await apiClient.get('/config');
    if (!isManagementConfigResponse(raw)) {
      throw new Error('Management API returned an invalid config response. Check the API Base URL.');
    }
    return normalizeConfigResponse(raw);
  },

  /**
   * 请求日志开关
   */
  updateRequestLog: (enabled: boolean) => apiClient.put('/request-log', { value: enabled }),
};

export const isManagementConfigResponse = (raw: unknown): raw is Record<string, unknown> =>
  raw !== null &&
  typeof raw === 'object' &&
  !Array.isArray(raw) &&
  (typeof (raw as Record<string, unknown>).port === 'number' ||
    typeof (raw as Record<string, unknown>).debug === 'boolean');
