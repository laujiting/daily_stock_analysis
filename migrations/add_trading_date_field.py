#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库迁移脚本：为AnalysisHistory表添加trading_date字段和索引
"""

import sys
import logging
from datetime import datetime
from sqlalchemy import text

# 添加项目根目录到路径
sys.path.insert(0, '.')

from src.storage import get_db
from src.config import get_config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    logger.info("开始数据库迁移：添加trading_date字段")

    config = get_config()
    logger.info(f"数据库路径: {config.database_path}")

    db = get_db()

    try:
        with db.get_session() as session:
            # 检查字段是否已经存在
            check_column_sql = text("""
                PRAGMA table_info(analysis_history)
            """)
            result = session.execute(check_column_sql)
            columns = [row[1] for row in result]

            if 'trading_date' in columns:
                logger.info("trading_date字段已经存在，跳过添加")
            else:
                # 添加trading_date字段，允许为NULL，后面再填充数据
                add_column_sql = text("""
                    ALTER TABLE analysis_history
                    ADD COLUMN trading_date DATE
                """)
                session.execute(add_column_sql)
                logger.info("成功添加trading_date字段")

            # 填充trading_date字段，使用created_at的日期部分
            fill_data_sql = text("""
                UPDATE analysis_history
                SET trading_date = DATE(created_at)
                WHERE trading_date IS NULL
            """)
            result = session.execute(fill_data_sql)
            logger.info(f"成功填充 {result.rowcount} 条记录的trading_date字段")

            # 修改字段为NOT NULL
            # SQLite不支持直接修改字段属性，需要创建新表，迁移数据，删除旧表，重命名新表
            # 这里我们跳过这个步骤，因为旧记录已经填充了数据，新记录会正确设置trading_date
            # 如果需要严格的NOT NULL约束，可以执行下面的步骤

            # 检查索引是否已经存在
            check_index_sql = text("""
                PRAGMA index_list(analysis_history)
            """)
            result = session.execute(check_index_sql)
            indexes = [row[1] for row in result]

            index_name = 'ix_analysis_code_trading_date'
            if index_name in indexes:
                logger.info(f"索引 {index_name} 已经存在，跳过创建")
            else:
                # 创建联合索引
                create_index_sql = text(f"""
                    CREATE INDEX {index_name}
                    ON analysis_history(code, trading_date)
                """)
                session.execute(create_index_sql)
                logger.info(f"成功创建索引 {index_name}")

            session.commit()
            logger.info("数据库迁移完成！")

    except Exception as e:
        logger.error(f"迁移失败: {e}", exc_info=True)
        session.rollback()
        sys.exit(1)


if __name__ == "__main__":
    main()
