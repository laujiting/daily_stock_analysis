# -*- coding: utf-8 -*-
"""
===================================
股票数据服务层
===================================

职责：
1. 封装股票数据获取逻辑
2. 提供实时行情和历史数据接口
"""

import logging
from datetime import datetime, timedelta, date
from typing import Optional, Dict, Any, List

from src.repositories.stock_repo import StockRepository
from src.storage import get_db, AnalysisHistory
from sqlalchemy import select, and_, desc

logger = logging.getLogger(__name__)


class StockService:
    """
    股票数据服务
    
    封装股票数据获取的业务逻辑
    """
    
    def __init__(self):
        """初始化股票数据服务"""
        self.repo = StockRepository()
    
    def get_realtime_quote(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取股票实时行情
        
        Args:
            stock_code: 股票代码
            
        Returns:
            实时行情数据字典
        """
        try:
            # 调用数据获取器获取实时行情
            from data_provider.base import DataFetcherManager
            
            manager = DataFetcherManager()
            quote = manager.get_realtime_quote(stock_code)
            
            if quote is None:
                logger.warning(f"获取 {stock_code} 实时行情失败")
                return None
            
            # UnifiedRealtimeQuote 是 dataclass，使用 getattr 安全访问字段
            # 字段映射: UnifiedRealtimeQuote -> API 响应
            # - code -> stock_code
            # - name -> stock_name
            # - price -> current_price
            # - change_amount -> change
            # - change_pct -> change_percent
            # - open_price -> open
            # - high -> high
            # - low -> low
            # - pre_close -> prev_close
            # - volume -> volume
            # - amount -> amount
            return {
                "stock_code": getattr(quote, "code", stock_code),
                "stock_name": getattr(quote, "name", None),
                "current_price": getattr(quote, "price", 0.0) or 0.0,
                "change": getattr(quote, "change_amount", None),
                "change_percent": getattr(quote, "change_pct", None),
                "open": getattr(quote, "open_price", None),
                "high": getattr(quote, "high", None),
                "low": getattr(quote, "low", None),
                "prev_close": getattr(quote, "pre_close", None),
                "volume": getattr(quote, "volume", None),
                "amount": getattr(quote, "amount", None),
                "update_time": datetime.now().isoformat(),
            }
            
        except ImportError:
            logger.warning("DataFetcherManager 未找到，使用占位数据")
            return self._get_placeholder_quote(stock_code)
        except Exception as e:
            logger.error(f"获取实时行情失败: {e}", exc_info=True)
            return None
    
    def get_history_data(
        self,
        stock_code: str,
        period: str = "daily",
        days: int = 30
    ) -> Dict[str, Any]:
        """
        获取股票历史行情
        
        Args:
            stock_code: 股票代码
            period: K 线周期 (daily/weekly/monthly)
            days: 获取天数
            
        Returns:
            历史行情数据字典
            
        Raises:
            ValueError: 当 period 不是 daily 时抛出（weekly/monthly 暂未实现）
        """
        # 验证 period 参数，只支持 daily
        if period != "daily":
            raise ValueError(
                f"暂不支持 '{period}' 周期，目前仅支持 'daily'。"
                "weekly/monthly 聚合功能将在后续版本实现。"
            )

        # 计算日期范围
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        # 优先从本地数据库查询数据
        db = get_db()
        local_data = db.get_data_range(stock_code, start_date, end_date)

        # 如果本地数据足够（数量 >= days * 0.8，考虑节假日），直接返回本地数据
        if len(local_data) >= days * 0.8:
            logger.info(f"从本地数据库获取 {stock_code} {len(local_data)} 天数据")
            # 获取股票名称
            stock_name = None
            try:
                from data_provider.base import DataFetcherManager
                manager = DataFetcherManager()
                stock_name = manager.get_stock_name(stock_code)
            except Exception:
                pass

            # 转换为响应格式
            data = []
            for item in local_data:
                data.append({
                    "date": item.date.isoformat(),
                    "open": item.open,
                    "high": item.high,
                    "low": item.low,
                    "close": item.close,
                    "volume": item.volume,
                    "amount": item.amount,
                    "change_percent": item.pct_chg,
                })

            return {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "period": period,
                "data": data,
            }

        # 本地数据不足，从远程获取
        try:
            # 调用数据获取器获取历史数据
            from data_provider.base import DataFetcherManager

            manager = DataFetcherManager()
            df, source = manager.get_daily_data(stock_code, days=days)

            if df is None or df.empty:
                logger.warning(f"获取 {stock_code} 历史数据失败")
                return {"stock_code": stock_code, "period": period, "data": []}

            # 保存数据到本地数据库
            db.save_daily_data(df, stock_code, data_source=source)

            # 获取股票名称
            stock_name = manager.get_stock_name(stock_code)
            
            # 转换为响应格式
            data = []
            for _, row in df.iterrows():
                date_val = row.get("date")
                if hasattr(date_val, "strftime"):
                    date_str = date_val.strftime("%Y-%m-%d")
                else:
                    date_str = str(date_val)
                
                data.append({
                    "date": date_str,
                    "open": float(row.get("open", 0)),
                    "high": float(row.get("high", 0)),
                    "low": float(row.get("low", 0)),
                    "close": float(row.get("close", 0)),
                    "volume": float(row.get("volume", 0)) if row.get("volume") else None,
                    "amount": float(row.get("amount", 0)) if row.get("amount") else None,
                    "change_percent": float(row.get("pct_chg", 0)) if row.get("pct_chg") else None,
                })
            
            return {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "period": period,
                "data": data,
            }
            
        except ImportError:
            logger.warning("DataFetcherManager 未找到，返回空数据")
            return {"stock_code": stock_code, "period": period, "data": []}
        except Exception as e:
            logger.error(f"获取历史数据失败: {e}", exc_info=True)
            return {"stock_code": stock_code, "period": period, "data": []}
    
    def _get_placeholder_quote(self, stock_code: str) -> Dict[str, Any]:
        """
        获取占位行情数据（用于测试）
        
        Args:
            stock_code: 股票代码
            
        Returns:
            占位行情数据
        """
        return {
            "stock_code": stock_code,
            "stock_name": f"股票{stock_code}",
            "current_price": 0.0,
            "change": None,
            "change_percent": None,
            "open": None,
            "high": None,
            "low": None,
            "prev_close": None,
            "volume": None,
            "amount": None,
            "update_time": datetime.now().isoformat(),
        }

    def get_effective_analysis_date(self) -> date:
        """
        获取有效的分析日期：
        - 工作日：如果在交易时间内（9:30-15:00），使用今天；否则使用最近一个交易日
        - 周末/节假日：使用最近一个交易日
        """
        today = date.today()
        weekday = today.weekday()

        # 周末 (周六5/周日6)
        if weekday >= 5:
            # 减去 (weekday - 4) 天，得到上周五
            return today - timedelta(days=weekday - 4)

        # 工作日，判断当前时间
        now = datetime.now()
        market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now.replace(hour=15, minute=0, second=0, microsecond=0)

        if now < market_open:
            # 开盘前，使用上一个交易日
            return today - timedelta(days=1 if weekday > 0 else 3) # 周一的话减3天到上周五
        elif now > market_close:
            # 收盘后，使用今天
            return today
        else:
            # 交易时间内，使用今日
            return today

    def get_latest_trading_date(self, stock_code: str) -> Optional[date]:
        """
        获取股票最新的交易日日期

        Args:
            stock_code: 股票代码

        Returns:
            最新的交易日日期，如果没有数据返回None
        """
        db = get_db()
        recent_data = db.get_latest_data(stock_code, days=1)
        if recent_data:
            return recent_data[0].date
        return None

    def has_analysis_for_date(self, stock_code: str, analysis_date: date) -> bool:
        """
        检查指定股票在指定日期是否已有分析记录

        Args:
            stock_code: 股票代码
            analysis_date: 分析日期（通常是有效的交易日）

        Returns:
            是否已存在分析记录
        """
        db = get_db()
        with db.get_session() as session:
            result = session.execute(
                select(AnalysisHistory).where(
                    and_(
                        AnalysisHistory.code == stock_code,
                        AnalysisHistory.trading_date == analysis_date
                    )
                )
            ).scalar_one_or_none()

            return result is not None
