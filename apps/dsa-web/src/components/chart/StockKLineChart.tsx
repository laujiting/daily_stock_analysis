import type React from 'react';
import { useEffect, useState, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { KLineData } from '../../types/analysis';
import { stocksApi } from '../../api/stocks';
import { Loading } from '../common/Loading';

interface StockKLineChartProps {
  stockCode: string;
  stockName?: string;
  className?: string;
}

/**
 * 股票 K 线图组件
 * 使用 ECharts 展示股票 K 线数据
 */
export const StockKLineChart: React.FC<StockKLineChartProps> = ({
  stockCode,
  stockName,
  className = '',
}) => {
  const [kLineData, setKLineData] = useState<KLineData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [days, setDays] = useState(180);
  const chartRef = useRef<ReactECharts>(null);

  // 加载 K 线数据
  const loadKLineData = async () => {
    setIsLoading(true);
    try {
      const response = await stocksApi.getHistory({
        stockCode,
        days,
      });
      // 确保数据按日期升序排列
      const sortedData = (response.data || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setKLineData(sortedData);
    } catch (err) {
      console.error('Failed to load K-line data:', err);
      setKLineData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 当股票代码或天数变化时重新加载数据
  useEffect(() => {
    loadKLineData();
  }, [stockCode, days]);

  // 准备图表数据
  const prepareChartData = () => {
    const dates = kLineData.map(item => item.date);
    const values = kLineData.map(item => [item.open, item.close, item.low, item.high]);
    const volumes = kLineData.map(item => item.volume || 0);

    return { dates, values, volumes };
  };

  // 计算 MA 均线
  const calculateMA = (dayCount: number) => {
    const result: (number | null)[] = [];
    for (let i = 0; i < kLineData.length; i++) {
      if (i < dayCount - 1) {
        result.push(null);
        continue;
      }
      let sum = 0;
      for (let j = 0; j < dayCount; j++) {
        sum += kLineData[i - j].close;
      }
      result.push(Number((sum / dayCount).toFixed(2)));
    }
    return result;
  };

  // 获取图表配置
  const getChartOption = (): EChartsOption => {
    const { dates, values, volumes } = prepareChartData();
    const ma5 = calculateMA(5);
    const ma10 = calculateMA(10);
    const ma20 = calculateMA(20);

    return {
      backgroundColor: 'transparent',
      title: {
        text: stockName || stockCode,
        left: 'center',
        textStyle: {
          color: '#ffffff',
          fontSize: 14,
          fontWeight: 500,
        },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
        backgroundColor: 'rgba(13, 13, 20, 0.95)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        textStyle: {
          color: '#ffffff',
        },
      },
      legend: {
        data: ['K线', 'MA5', 'MA10', 'MA20', '成交量'],
        top: 30,
        textStyle: {
          color: '#a0a0b0',
          fontSize: 11,
        },
      },
      grid: [
        {
          left: '10%',
          right: '8%',
          top: 80,
          height: '50%',
        },
        {
          left: '10%',
          right: '8%',
          top: '70%',
          height: '15%',
        },
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          boundaryGap: false,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
          axisLabel: { color: '#606070', fontSize: 10 },
          splitLine: { show: false },
        },
        {
          type: 'category',
          gridIndex: 1,
          data: dates,
          boundaryGap: false,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
          axisLabel: { show: false },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          scale: true,
          splitArea: {
            show: true,
            areaStyle: {
              color: ['rgba(255, 255, 255, 0.01)', 'rgba(255, 255, 255, 0.02)'],
            },
          },
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
          axisLabel: { color: '#606070', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
          axisLabel: { color: '#606070', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: 'slider',
          bottom: 10,
          start: 0,
          end: 100,
          height: 20,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          fillerColor: 'rgba(0, 212, 255, 0.2)',
          handleStyle: {
            color: '#00d4ff',
            borderColor: '#00d4ff',
          },
          textStyle: {
            color: '#606070',
          },
        },
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: values,
          itemStyle: {
            color: '#22c55e',
            color0: '#ef4444',
            borderColor: '#22c55e',
            borderColor0: '#ef4444',
          },
        },
        {
          name: 'MA5',
          type: 'line',
          data: ma5,
          smooth: true,
          lineStyle: {
            width: 1,
            color: '#00d4ff',
          },
          showSymbol: false,
        },
        {
          name: 'MA10',
          type: 'line',
          data: ma10,
          smooth: true,
          lineStyle: {
            width: 1,
            color: '#f97316',
          },
          showSymbol: false,
        },
        {
          name: 'MA20',
          type: 'line',
          data: ma20,
          smooth: true,
          lineStyle: {
            width: 1,
            color: '#a855f7',
          },
          showSymbol: false,
        },
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
          itemStyle: {
            color: (params: any) => {
              const dataIndex = params.dataIndex;
              if (dataIndex < 0 || dataIndex >= values.length) return '#22c55e';
              const current = values[dataIndex];
              if (!current || current.length < 2) return '#22c55e';
              // 上涨是收盘价 >= 开盘价，下跌是收盘价 < 开盘价
              return current[1] >= current[0] ? '#22c55e' : '#ef4444';
            },
          },
        },
      ],
    };
  };

  const daysOptions = [
    { value: 30, label: '30天' },
    { value: 60, label: '60天' },
    { value: 90, label: '90天' },
    { value: 180, label: '180天' },
  ];

  return (
    <div className={`glass-card p-4 ${className}`}>
      {/* 控制面板 */}
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">天数:</span>
          <div className="flex gap-1">
            {daysOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDays(option.value)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  days === option.value
                    ? 'bg-cyan/20 text-cyan border border-cyan/30'
                    : 'bg-dark/30 text-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 图表区域 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-80">
          <Loading />
        </div>
      ) : kLineData.length === 0 ? (
        <div className="flex items-center justify-center h-80 text-muted text-xs">
          暂无 K 线数据
        </div>
      ) : (
        <ReactECharts
          ref={chartRef}
          option={getChartOption()}
          style={{ height: '400px', width: '100%' }}
          notMerge={true}
          lazyUpdate={true}
        />
      )}
    </div>
  );
};
