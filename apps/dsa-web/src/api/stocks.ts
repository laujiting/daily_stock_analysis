import apiClient from './index';
import { toCamelCase } from './utils';
import type { StockHistoryResponse } from '../types/analysis';

export interface GetStockHistoryParams {
  stockCode: string;
  days?: number;
}

export const stocksApi = {
  /**
   * 获取股票历史 K 线数据
   * @param params 参数
   */
  getHistory: async (params: GetStockHistoryParams): Promise<StockHistoryResponse> => {
    const { stockCode, days = 180 } = params;

    const queryParams: Record<string, string | number> = { period: 'daily', days };

    const response = await apiClient.get<Record<string, unknown>>(`/api/v1/stocks/${stockCode}/history`, {
      params: queryParams,
    });

    const data = toCamelCase<StockHistoryResponse>(response.data);
    return data;
  },
};
