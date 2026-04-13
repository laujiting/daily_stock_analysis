import type React from 'react';
import { useState } from 'react';
import type { HistoryItem } from '../../types/analysis';
import { HistoryList } from './HistoryList';

interface BottomHistoryPanelProps {
  items: HistoryItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  selectedQueryId?: string;
  onItemClick: (queryId: string) => void;
  onLoadMore: () => void;
  className?: string;
}

/**
 * 底部历史记录面板组件
 * 可折叠的历史记录列表，位于页面底部
 */
export const BottomHistoryPanel: React.FC<BottomHistoryPanelProps> = ({
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  selectedQueryId,
  onItemClick,
  onLoadMore,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // 折叠/展开切换
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={`border-t border-white/10 bg-dark/80 backdrop-blur-sm ${className}`}>
      {/* 面板头部 */}
      <div
        className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={toggleExpand}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-muted transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
          <h3 className="text-xs font-medium text-purple uppercase tracking-wider">
            历史记录 ({items.length}条)
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            {isExpanded ? '点击收起' : '点击展开'}
          </span>
        </div>
      </div>

      {/* 面板内容 */}
      {isExpanded && (
        <div className="max-h-64">
          <HistoryList
            items={items}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            selectedQueryId={selectedQueryId}
            onItemClick={onItemClick}
            onLoadMore={onLoadMore}
            className="border-0 rounded-none bg-transparent"
          />
        </div>
      )}
    </div>
  );
};
