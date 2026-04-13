# -*- coding: utf-8 -*-
"""
===================================
股票数据接口
===================================

职责：
1. 提供 GET /api/v1/stocks/{code}/quote 实时行情接口
2. 提供 GET /api/v1/stocks/{code}/history 历史行情接口
"""

import logging

from fastapi import APIRouter, HTTPException, Query

from api.v1.schemas.stocks import (
    StockQuote,
    StockHistoryResponse,
    KLineData,
)
from api.v1.schemas.common import ErrorResponse
from src.services.stock_service import StockService
from src.storage import get_db, AnalysisHistory
from sqlalchemy import select, func, desc
from typing import Dict, List, Any
import re

logger = logging.getLogger(__name__)

router = APIRouter()


def _is_hk_code(stock_code: str) -> bool:
    """
    判断代码是否为港股
    港股代码规则:
    - 5位数字代码，如 '00700' (腾讯控股)
    - 部分港股代码可能带有前缀，如 'hk00700', 'hk1810'
    """
    code = stock_code.lower()
    if code.startswith('hk'):
        numeric_part = code[2:]
        return numeric_part.isdigit() and 1 <= len(numeric_part) <= 5
    return code.isdigit() and len(code) == 5


def _is_us_code(stock_code: str) -> bool:
    """
    判断代码是否为美股
    美股代码规则:
    - 1-5个大写字母，如 'AAPL' (苹果), 'TSLA' (特斯拉)
    - 可能包含 '.' 用于特殊股票类别，如 'BRK.B' (伯克希尔B类股)
    """
    code = stock_code.strip().upper()
    return bool(re.match(r"^[A-Z]{1,5}(\.[A-Z])?$", code))


def _classify_stock_market(stock_code: str) -> str:
    """
    分类股票所属市场
    返回: 'a' (A股), 'hk' (港股), 'us' (美股)
    """
    if _is_us_code(stock_code):
        return 'us'
    if _is_hk_code(stock_code):
        return 'hk'
    return 'a'


@router.get(
    "/analyzed",
    responses={
        200: {"description": "已分析股票列表（按市场分组）"},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取已分析股票列表",
    description="获取所有已经分析过的股票列表，按A股/港股/美股分组"
)
def get_analyzed_stocks() -> Dict[str, List[Dict[str, Any]]]:
    """
    获取已分析股票列表
    返回按市场分组的已分析股票，包含每只股票的最新分析时间和分析次数
    """
    try:
        db = get_db()
        with db.get_session() as session:
            # 查询所有已分析的股票，按代码分组，获取最新分析时间和分析次数
            stmt = select(
                AnalysisHistory.code,
                AnalysisHistory.name,
                func.max(AnalysisHistory.created_at).label("latest_analysis_at"),
                func.count(AnalysisHistory.id).label("analysis_count")
            ).group_by(AnalysisHistory.code, AnalysisHistory.name).order_by(desc("latest_analysis_at"))

            results = session.execute(stmt).all()

            # 按市场分组
            grouped = {
                "a": [],
                "hk": [],
                "us": []
            }

            for row in results:
                market = _classify_stock_market(row.code)
                grouped[market].append({
                    "code": row.code,
                    "name": row.name,
                    "latest_analysis_at": row.latest_analysis_at.isoformat(),
                    "analysis_count": row.analysis_count
                })

            return grouped

    except Exception as e:
        logger.error(f"获取已分析股票列表失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"获取已分析股票列表失败: {str(e)}"
            }
        )


@router.get(
    "/{stock_code}/quote",
    response_model=StockQuote,
    responses={
        200: {"description": "行情数据"},
        404: {"description": "股票不存在", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取股票实时行情",
    description="获取指定股票的最新行情数据"
)
def get_stock_quote(stock_code: str) -> StockQuote:
    """
    获取股票实时行情
    
    获取指定股票的最新行情数据
    
    Args:
        stock_code: 股票代码（如 600519、00700、AAPL）
        
    Returns:
        StockQuote: 实时行情数据
        
    Raises:
        HTTPException: 404 - 股票不存在
    """
    try:
        service = StockService()
        
        # 使用 def 而非 async def，FastAPI 自动在线程池中执行
        result = service.get_realtime_quote(stock_code)
        
        if result is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "not_found",
                    "message": f"未找到股票 {stock_code} 的行情数据"
                }
            )
        
        return StockQuote(
            stock_code=result.get("stock_code", stock_code),
            stock_name=result.get("stock_name"),
            current_price=result.get("current_price", 0.0),
            change=result.get("change"),
            change_percent=result.get("change_percent"),
            open=result.get("open"),
            high=result.get("high"),
            low=result.get("low"),
            prev_close=result.get("prev_close"),
            volume=result.get("volume"),
            amount=result.get("amount"),
            update_time=result.get("update_time")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取实时行情失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"获取实时行情失败: {str(e)}"
            }
        )


@router.get(
    "/{stock_code}/history",
    response_model=StockHistoryResponse,
    responses={
        200: {"description": "历史行情数据"},
        422: {"description": "不支持的周期参数", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取股票历史行情",
    description="获取指定股票的历史 K 线数据"
)
def get_stock_history(
    stock_code: str,
    period: str = Query("daily", description="K 线周期", pattern="^(daily|weekly|monthly)$"),
    days: int = Query(30, ge=1, le=365, description="获取天数")
) -> StockHistoryResponse:
    """
    获取股票历史行情
    
    获取指定股票的历史 K 线数据
    
    Args:
        stock_code: 股票代码
        period: K 线周期 (daily/weekly/monthly)
        days: 获取天数
        
    Returns:
        StockHistoryResponse: 历史行情数据
    """
    try:
        service = StockService()
        
        # 使用 def 而非 async def，FastAPI 自动在线程池中执行
        result = service.get_history_data(
            stock_code=stock_code,
            period=period,
            days=days
        )
        
        # 转换为响应模型
        data = [
            KLineData(
                date=item.get("date"),
                open=item.get("open"),
                high=item.get("high"),
                low=item.get("low"),
                close=item.get("close"),
                volume=item.get("volume"),
                amount=item.get("amount"),
                change_percent=item.get("change_percent")
            )
            for item in result.get("data", [])
        ]
        
        return StockHistoryResponse(
            stock_code=stock_code,
            stock_name=result.get("stock_name"),
            period=period,
            data=data
        )
    
    except ValueError as e:
        # period 参数不支持的错误（如 weekly/monthly）
        raise HTTPException(
            status_code=422,
            detail={
                "error": "unsupported_period",
                "message": str(e)
            }
        )
    except Exception as e:
        logger.error(f"获取历史行情失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"获取历史行情失败: {str(e)}"
            }
        )
