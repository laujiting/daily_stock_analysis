import type React from 'react';
import { useState } from 'react';

interface DateFilterProps {
  className?: string;
  availableDates?: string[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onClear?: () => void;
}

// 时间范围选项
const RANGE_OPTIONS = [
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
  { value: '90d', label: '近90天' },
  { value: 'all', label: '全部' },
] as const;

/**
 * 报告日期筛选组件
 * 显示可选择的分析日期列表，支持按时间范围筛选
 */
export const DateFilter: React.FC<DateFilterProps> = ({
  className = '',
  availableDates = [],
  selectedDate,
  onDateChange,
  onClear,
}) => {
  const [selectedRange, setSelectedRange] = useState<string>('all');

  // 按日期降序排列
  const sortedDates = [...availableDates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // 处理日期点击
  const handleDateClick = (date: string) => {
    if (onDateChange) {
      onDateChange(date);
    }
  };

  // 处理范围选择
  const handleRangeChange = (range: string) => {
    setSelectedRange(range);
    // 这里可以添加按范围过滤的逻辑，如果需要的话
  };

  return (
    <div className={`glass-card p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-purple uppercase tracking-wider flex items-center gap-1.5">
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
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          历史报告
        </h3>

        {selectedDate && (
          <button
            onClick={onClear}
            className="text-xs text-muted hover:text-white transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            清除
          </button>
        )}
      </div>

      {/* 时间范围选择 */}
      <div className="flex flex-wrap gap-1 mb-3">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleRangeChange(option.value)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              selectedRange === option.value
                ? 'bg-cyan/20 text-cyan border border-cyan/30'
                : 'bg-dark/30 text-muted hover:text-white hover:bg-white/5'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 日期列表 */}
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
        {sortedDates.length === 0 ? (
          <div className="text-center py-2 text-muted text-xs w-full">
            暂无历史日期
          </div>
        ) : (
          sortedDates.map((date) => (
            <button
              key={date}
              type="button"
              onClick={() => handleDateClick(date)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedDate === date
                  ? 'bg-purple/30 text-white border border-purple/40'
                  : 'bg-dark/30 text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              {date}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
