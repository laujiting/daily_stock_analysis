import type React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { HistoryItem, AnalysisReport, TaskInfo, BulkAnalysisResult } from '../types/analysis';
import { historyApi } from '../api/history';
import { analysisApi, DuplicateTaskError } from '../api/analysis';
import { validateStockCodes } from '../utils/validation';
import { getRecentStartDate, toDateInputValue } from '../utils/format';
import { useAnalysisStore } from '../stores/analysisStore';
import { ReportSummary } from '../components/report';
import { HistoryList } from '../components/history';
import { TaskPanel } from '../components/tasks';
import { useTaskStream } from '../hooks';

/**
 * 首页 - 单页设计
 * 顶部输入 + 左侧历史 + 右侧报告
 */
const HomePage: React.FC = () => {
  const { setLoading, setError: setStoreError } = useAnalysisStore();

  // 输入状态
  const [stockCodeInput, setStockCodeInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputError, setInputError] = useState<string>();
  const [bulkResult, setBulkResult] = useState<BulkAnalysisResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  // 历史列表状态
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // 报告详情状态
  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // 任务队列状态
  const [activeTasks, setActiveTasks] = useState<TaskInfo[]>([]);

  // 用于跟踪当前分析请求，避免竞态条件
  const analysisRequestIdRef = useRef<number>(0);

  // 更新任务列表中的任务
  const updateTask = useCallback((updatedTask: TaskInfo) => {
    setActiveTasks((prev) => {
      const index = prev.findIndex((t) => t.taskId === updatedTask.taskId);
      if (index >= 0) {
        const newTasks = [...prev];
        newTasks[index] = updatedTask;
        return newTasks;
      }
      return prev;
    });
  }, []);

  // 移除已完成/失败的任务
  const removeTask = useCallback((taskId: string) => {
    setActiveTasks((prev) => prev.filter((t) => t.taskId !== taskId));
  }, []);

  // SSE 任务流
  useTaskStream({
    onTaskCreated: (task) => {
      setActiveTasks((prev) => {
        // 避免重复添加
        if (prev.some((t) => t.taskId === task.taskId)) return prev;
        return [...prev, task];
      });
    },
    onTaskStarted: updateTask,
    onTaskCompleted: (task) => {
      // 刷新历史列表
      fetchHistory();
      // 延迟移除任务，让用户看到完成状态
      setTimeout(() => removeTask(task.taskId), 2000);
    },
    onTaskFailed: (task) => {
      updateTask(task);
      // 显示错误提示
      setStoreError(task.error || '分析失败');
      // 延迟移除任务
      setTimeout(() => removeTask(task.taskId), 5000);
    },
    onError: () => {
      console.warn('SSE 连接断开，正在重连...');
    },
    enabled: true,
  });

// 加载历史列表
  const fetchHistory = useCallback(async (autoSelectFirst = false, reset = true) => {
    if (reset) {
      setIsLoadingHistory(true);
      setCurrentPage(1);
    } else {
      setIsLoadingMore(true);
    }

    const page = reset ? 1 : currentPage + 1;

    try {
      const response = await historyApi.getList({
        startDate: getRecentStartDate(30),
        endDate: toDateInputValue(new Date()),
        page,
        limit: pageSize,
      });

      if (reset) {
        setHistoryItems(response.items);
      } else {
        setHistoryItems(prev => [...prev, ...response.items]);
      }

      // 判断是否还有更多数据
      const totalLoaded = reset ? response.items.length : historyItems.length + response.items.length;
      setHasMore(totalLoaded < response.total);
      setCurrentPage(page);

      // 如果需要自动选择第一条，且有数据，且当前没有选中报告
      if (autoSelectFirst && response.items.length > 0 && !selectedReport) {
        const firstItem = response.items[0];
        setIsLoadingReport(true);
        try {
          const report = await historyApi.getDetail(firstItem.queryId);
          setSelectedReport(report);
        } catch (err) {
          console.error('Failed to fetch first report:', err);
        } finally {
          setIsLoadingReport(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoadingHistory(false);
      setIsLoadingMore(false);
    }
  }, [selectedReport, currentPage, historyItems.length, pageSize]);

  // 加载更多历史记录
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      fetchHistory(false, false);
    }
  }, [fetchHistory, isLoadingMore, hasMore]);

  // 初始加载 - 自动选择第一条
  useEffect(() => {
    fetchHistory(true);
  }, []);

  // 点击历史项加载报告
  const handleHistoryClick = async (queryId: string) => {
    // 取消当前分析请求的结果显示（通过递增 requestId）
    analysisRequestIdRef.current += 1;

    setIsLoadingReport(true);
    try {
      const report = await historyApi.getDetail(queryId);
      setSelectedReport(report);
    } catch (err) {
      console.error('Failed to fetch report:', err);
    } finally {
      setIsLoadingReport(false);
    }
  };

  // 分析股票（支持批量模式）
  const handleAnalyze = async () => {
    setInputError(undefined);
    setBulkResult(null);
    setShowResult(false);
    setIsAnalyzing(true);
    setLoading(true);
    setStoreError(null);

    // 记录当前请求的 ID
    const currentRequestId = ++analysisRequestIdRef.current;

    try {
      // 1. 批量验证输入
      const validationResult = validateStockCodes(stockCodeInput);

      if (validationResult.validCodes.length === 0 && validationResult.invalidCodes.length === 0) {
        setInputError('请输入有效的股票代码');
        return;
      }

      // 2. 查重处理
      const skippedCodes: Array<{ code: string; reason: string }> = [];
      const validCodesAfterCheck: string[] = [];

      // 处理输入重复
      validationResult.duplicateCodes.forEach(code => {
        skippedCodes.push({ code, reason: '输入重复' });
      });

      // 检查每个有效代码
      for (const code of validationResult.validCodes) {
        // 检查是否在活跃任务队列中
        const isInActiveQueue = activeTasks.some(
          task => task.stockCode.toUpperCase() === code.toUpperCase() &&
          (task.status === 'pending' || task.status === 'processing')
        );
        if (isInActiveQueue) {
          skippedCodes.push({ code, reason: '正在分析中' });
          continue;
        }

        // 检查今日是否已分析
        const isAnalyzedToday = await historyApi.isStockAnalyzedToday(code);
        if (isAnalyzedToday) {
          skippedCodes.push({ code, reason: '今日已分析' });
          continue;
        }

        validCodesAfterCheck.push(code);
      }

      // 3. 批量提交分析任务
      const tasksCreated: Array<{ taskId: string; stockCode: string }> = [];
      const errors: Array<{ code: string; message: string }> = [];

      for (const code of validCodesAfterCheck) {
        try {
          const response = await analysisApi.analyzeAsync({
            stockCode: code,
            reportType: 'detailed',
          });
          tasksCreated.push({ taskId: response.taskId, stockCode: code });
        } catch (err) {
          console.error(`Failed to analyze ${code}:`, err);
          if (err instanceof DuplicateTaskError) {
            skippedCodes.push({ code, reason: '正在分析中' });
          } else {
            errors.push({
              code,
              message: err instanceof Error ? err.message : '分析失败'
            });
          }
        }
      }

      // 4. 处理结果
      if (currentRequestId === analysisRequestIdRef.current) {
        // 构造批量结果
        const result: BulkAnalysisResult = {
          totalInput: validationResult.validCodes.length + validationResult.invalidCodes.length + validationResult.duplicateCodes.length,
          validCount: validCodesAfterCheck.length,
          skippedCount: skippedCodes.length + validationResult.invalidCodes.length,
          errorCount: errors.length,
          tasksCreated,
          skippedCodes: [
            ...skippedCodes,
            ...validationResult.invalidCodes.map(c => ({ code: c.code, reason: c.message }))
          ],
          errors,
        };

        setBulkResult(result);
        setShowResult(true);

        // 清空输入框（如果没有错误或者用户希望保留输入可以考虑不清理，这里保持原有行为）
        if (errors.length === 0) {
          setStockCodeInput('');
        }

        // 自动隐藏结果提示，3秒后
        setTimeout(() => {
          setShowResult(false);
        }, 8000);
      }
    } catch (err) {
      console.error('Bulk analysis failed:', err);
      if (currentRequestId === analysisRequestIdRef.current) {
        setStoreError(err instanceof Error ? err.message : '批量分析失败');
      }
    } finally {
      if (currentRequestId === analysisRequestIdRef.current) {
        setIsAnalyzing(false);
        setLoading(false);
      }
    }
  };

  // 回车提交（支持Ctrl+Enter提交多行输入）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 如果是普通回车且不是Ctrl/Command组合键，阻止默认换行（除非用户希望换行）
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      // 如果是单行输入模式下直接提交，这里现在是textarea，默认回车是换行
      // 所以改为Ctrl+Enter提交
      return;
    }
    // Ctrl+Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && stockCodeInput && !isAnalyzing) {
      e.preventDefault();
      handleAnalyze();
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部输入栏 */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 max-w-2xl">
          <div className="flex-1 relative">
            <textarea
              value={stockCodeInput}
              onChange={(e) => {
                setStockCodeInput(e.target.value.toUpperCase());
                setInputError(undefined);
                setShowResult(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="输入股票代码，支持逗号/换行分隔，如 600519, 00700, AAPL&#10;按 Ctrl+Enter 提交分析"
              disabled={isAnalyzing}
              className={`input-terminal w-full min-h-[60px] resize-y ${inputError ? 'border-danger/50' : ''}`}
              rows={2}
            />
            {inputError && (
              <p className="absolute -bottom-4 left-0 text-xs text-danger">{inputError}</p>
            )}

            {/* 批量分析结果提示 */}
            {showResult && bulkResult && (
              <div className="absolute z-10 left-0 right-0 -bottom-[120px] bg-elevated border border-white/10 rounded-lg p-3 text-xs shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">批量分析结果</span>
                  <button
                    onClick={() => setShowResult(false)}
                    className="text-muted hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1.5">
                  <p>
                    总输入: {bulkResult.totalInput} 只 |
                    已提交: {bulkResult.tasksCreated.length} 只 |
                    已跳过: {bulkResult.skippedCount} 只 |
                    错误: {bulkResult.errorCount} 只
                  </p>
                  {bulkResult.skippedCodes.length > 0 && (
                    <div>
                      <p className="text-warning mb-1">跳过的股票:</p>
                      <ul className="pl-4 list-disc">
                        {bulkResult.skippedCodes.slice(0, 5).map((item, idx) => (
                          <li key={idx} className="text-muted">
                            {item.code}: {item.reason}
                          </li>
                        ))}
                        {bulkResult.skippedCodes.length > 5 && (
                          <li className="text-muted">... 还有 {bulkResult.skippedCodes.length - 5} 只</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {bulkResult.errors.length > 0 && (
                    <div>
                      <p className="text-danger mb-1">分析失败:</p>
                      <ul className="pl-4 list-disc">
                        {bulkResult.errors.map((item, idx) => (
                          <li key={idx} className="text-danger">
                            {item.code}: {item.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!stockCodeInput.trim() || isAnalyzing}
            className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
          >
            {isAnalyzing ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                分析中
              </>
            ) : (
              '分析'
            )}
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 flex overflow-hidden p-3 gap-3">
{/* 左侧：任务面板 + 历史列表 */}
        <div className="flex flex-col gap-3 w-64 flex-shrink-0 overflow-hidden">
          {/* 任务面板 */}
          <TaskPanel tasks={activeTasks} />

          {/* 历史列表 */}
          <HistoryList
            items={historyItems}
            isLoading={isLoadingHistory}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            selectedQueryId={selectedReport?.meta.queryId}
            onItemClick={handleHistoryClick}
            onLoadMore={handleLoadMore}
            className="max-h-[62vh] overflow-hidden"
          />
        </div>

        {/* 右侧报告详情 */}
        <section className="flex-1 overflow-y-auto pl-1">
          {isLoadingReport ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-10 h-10 border-3 border-cyan/20 border-t-cyan rounded-full animate-spin" />
              <p className="mt-3 text-secondary text-sm">加载报告中...</p>
            </div>
          ) : selectedReport ? (
            <div className="max-w-4xl">
              {/* 报告内容 */}
              <ReportSummary data={selectedReport} isHistory />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 mb-3 rounded-xl bg-elevated flex items-center justify-center">
                <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-base font-medium text-white mb-1.5">开始分析</h3>
              <p className="text-xs text-muted max-w-xs">
                输入股票代码进行分析，或从左侧选择历史报告查看
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default HomePage;
