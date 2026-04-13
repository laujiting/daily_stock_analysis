import { create } from 'zustand';
import apiClient from '../api/index';

// 股票项类型
export interface StockItem {
  code: string;
  name: string;
  latest_analysis_at: string;
  analysis_count: number;
}

// 按市场分组的股票列表
export interface GroupedStocks {
  a: StockItem[];
  hk: StockItem[];
  us: StockItem[];
}

interface StockState {
  // 已分析股票列表（按市场分组）
  groupedStocks: GroupedStocks;
  // 选中的市场
  selectedMarket: 'a' | 'hk' | 'us' | 'all';
  // 选中的股票
  selectedStock: string | null;
  // 加载状态
  loading: boolean;
  // 错误信息
  error: string | null;

  // Actions
  setGroupedStocks: (stocks: GroupedStocks) => void;
  setSelectedMarket: (market: 'a' | 'hk' | 'us' | 'all') => void;
  setSelectedStock: (code: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchAnalyzedStocks: () => Promise<void>;
  reset: () => void;
}

export const useStockStore = create<StockState>((set, get) => ({
  // 初始状态
  groupedStocks: {
    a: [],
    hk: [],
    us: [],
  },
  selectedMarket: 'all',
  selectedStock: null,
  loading: false,
  error: null,

  // Actions
  setGroupedStocks: (stocks) => set({ groupedStocks: stocks }),

  setSelectedMarket: (market) => set({ selectedMarket: market }),

  setSelectedStock: (code) => set({ selectedStock: code }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error, loading: false }),

  // 获取已分析股票列表
  fetchAnalyzedStocks: async () => {
    const { loading } = get();
    if (loading) return;

    set({ loading: true, error: null });

    try {
      const response = await apiClient.get('/api/v1/stocks/analyzed');
      set({
        groupedStocks: response.data,
        loading: false
      });
    } catch (err) {
      console.error('获取已分析股票列表失败:', err);
      set({
        error: err instanceof Error ? err.message : '获取股票列表失败',
        loading: false
      });
    }
  },

  reset: () => set({
    selectedStock: null,
    error: null,
  }),
}));
