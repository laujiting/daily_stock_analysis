import type React from 'react';
import { useEffect, useState } from 'react';
import { useStockStore, type StockItem } from '../../stores/stockStore';
import { formatDate } from '../../utils/format';

interface StockMenuProps {
  className?: string;
  onStockSelect?: (stockCode: string) => void;
}

// 市场选项
const MARKET_OPTIONS = [
  { value: 'all', label: '全部', icon: '🌐' },
  { value: 'a', label: 'A股', icon: '🇨🇳' },
  { value: 'hk', label: '港股', icon: '🇭🇰' },
  { value: 'us', label: '美股', icon: '🇺🇸' },
] as const;

/**
 * 股票分类菜单组件
 * 按市场分组显示已分析的股票列表，支持搜索和筛选
 */
export const StockMenu: React.FC<StockMenuProps> = ({
  className = '',
  onStockSelect,
}) => {
  const {
    groupedStocks,
    selectedMarket,
    selectedStock,
    loading,
    error,
    fetchAnalyzedStocks,
    setSelectedMarket,
    setSelectedStock,
  } = useStockStore();

  const [searchQuery, setSearchQuery] = useState('');

  // 组件加载时获取股票列表
  useEffect(() => {
    fetchAnalyzedStocks();
  }, [fetchAnalyzedStocks]);

  // 过滤股票列表
  const filteredStocks = (stocks: StockItem[]) => {
    if (!searchQuery.trim()) return stocks;
    const query = searchQuery.toLowerCase();
    return stocks.filter(
      (stock) =>
        stock.code.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query)
    );
  };

  // 获取当前选中市场的股票列表
  const getCurrentStocks = () => {
    if (selectedMarket === 'all') {
      return [...groupedStocks.a, ...groupedStocks.hk, ...groupedStocks.us];
    }
    return groupedStocks[selectedMarket];
  };

  const currentStocks = filteredStocks(getCurrentStocks());

  // 处理股票点击
  const handleStockClick = (stockCode: string) => {
    setSelectedStock(stockCode);
    if (onStockSelect) {
      onStockSelect(stockCode);
    }
  };

  return (
    <aside className={`glass-card overflow-hidden flex flex-col ${className}`}>
      <div className="p-3 flex-1 overflow-y-auto">
        <h2 className="text-xs font-medium text-purple uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          股票列表
        </h2>

        {/* 搜索框 */}
        <div className="mb-3 relative">
          <input
            type="text"
            placeholder="搜索股票代码/名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-dark/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-muted focus:outline-none focus:border-cyan/50 transition-colors"
          />
          <svg
            className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* 市场分类标签 */}
        <div className="flex flex-wrap gap-1 mb-3">
          {MARKET_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedMarket(option.value)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                selectedMarket === option.value
                  ? 'bg-purple/20 text-purple border border-purple/30'
                  : 'bg-dark/30 text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="mr-1">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>

        {/* 股票列表 */}
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-6 text-red-400 text-xs">
            {error}
            <button
              onClick={() => fetchAnalyzedStocks()}
              className="block mx-auto mt-2 text-cyan hover:text-cyan/80 underline"
            >
              重试
            </button>
          </div>
        ) : currentStocks.length === 0 ? (
          <div className="text-center py-6 text-muted text-xs">
            {searchQuery ? '没有找到匹配的股票' : '暂无已分析的股票'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {currentStocks.map((stock) => (
              <button
                key={stock.code}
                type="button"
                onClick={() => handleStockClick(stock.code)}
                className={`history-item w-full text-left ${
                  selectedStock === stock.code ? 'active' : ''
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-medium text-white truncate text-xs">
                        {stock.name || stock.code}
                      </span>
                      <span className="text-xs font-mono text-muted">
                        {stock.analysis_count}次
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted font-mono">
                        {stock.code}
                      </span>
                      <span className="text-xs text-muted/50">·</span>
                      <span className="text-xs text-muted">
                        {formatDate(stock.latest_analysis_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
