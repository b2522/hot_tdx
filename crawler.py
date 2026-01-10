import requests
import datetime
import db
import logging
import sqlite3

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# API基本URL
BASE_URL = "https://flash-api.xuangubao.com.cn/api/surge_stock/stocks"

# 请求头，模拟浏览器请求
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive"
}

# 开始日期：2025年12月1日
START_DATE = datetime.datetime(2025, 12, 1)

def is_weekday(date):
    """判断日期是否为工作日（周一到周五）"""
    return date.weekday() < 5  # 0-4表示周一到周五

def format_date(date):
    """将日期格式化为YYYYMMDD格式"""
    return date.strftime("%Y%m%d")

def get_current_time():
    """获取当前时间（时分，24小时制）"""
    now = datetime.datetime.now()
    return now.hour, now.minute

def is_valid_crawl_time(bypass=False):
    """检查是否在允许的抓取时间范围内（15:00到9:00）
    
    Args:
        bypass (bool): 是否绕过时间检查（默认False）
        
    Returns:
        bool: 是否允许抓取
    """
    if bypass:
        return True
        
    hour, minute = get_current_time()
    
    # 允许的时间范围：15:00到第二天9:00
    # 即hour >= 15 或者 hour < 9
    return hour >= 15 or hour < 9

def crawl_stock_data(crawl_today_only=True, force_update=False, bypass_time_check=False):
    """抓取股票数据
    
    Args:
        crawl_today_only (bool): 是否只抓取今天的数据（默认True）
        force_update (bool): 是否强制更新已有数据（默认False）
        bypass_time_check (bool): 是否绕过时间检查（默认False）
    
    Returns:
        dict: 抓取结果信息，包括状态、日期和数据数量
    """
    result = {
        "status": "success",
        "dates_processed": [],
        "total_data": 0,
        "message": ""
    }
    
    # 获取当前时间作为结束日期
    end_date = datetime.datetime.now()
    
    # 检查是否在允许的抓取时间范围内
    if not is_valid_crawl_time(bypass_time_check):
        logging.error("不在允许的抓取时间范围内（只能在15:00到9:00之间抓取）")
        result["status"] = "error"
        result["message"] = "不在允许的抓取时间范围内（只能在15:00到9:00之间抓取）"
        return result
    
    if crawl_today_only:
        # 只抓取今天的数据
        current_date = end_date
    else:
        # 抓取从开始日期到今天的所有数据
        current_date = START_DATE
    
    while current_date <= end_date:
        # 判断是否为工作日
        if is_weekday(current_date):
            date_str = format_date(current_date)
            result["dates_processed"].append(date_str)
            
            # 检查该日期是否已有数据
            if db.date_has_data(date_str):
                if force_update:
                    logging.info(f"强制更新{date_str}的股票数据，先删除旧表")
                else:
                    logging.info(f"日期{date_str}已有数据，将删除旧表并重新创建")
                
                # 删除旧表
                try:
                    conn = sqlite3.connect(db.DB_PATH)
                    cursor = conn.cursor()
                    table_name = f"stock_{date_str}"
                    cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
                    conn.commit()
                    conn.close()
                    logging.info(f"成功删除旧表{table_name}")
                except Exception as e:
                    logging.error(f"删除旧表失败: {e}")
                    continue
            else:
                if force_update:
                    logging.info(f"强制更新{date_str}的股票数据")
                else:
                    logging.info(f"开始抓取{date_str}的股票数据")
            
            # 构建API URL
            url = f"{BASE_URL}?date={date_str}&normal=true&uplimit=true"
            
            try:
                # 发送API请求（使用模拟浏览器的请求头）
                response = requests.get(url, headers=HEADERS)
                response.raise_for_status()  # 检查请求是否成功
                
                # 解析JSON数据
                data = response.json()
                
                if data.get("code") == 20000 and data.get("data"):
                    # 获取股票数据项
                    items = data["data"].get("items", [])
                    
                    if items:
                        logging.info(f"成功获取{date_str}的{len(items)}条股票数据")
                        # 处理并存储数据
                        process_and_store_data(date_str, items)
                        result["total_data"] += len(items)
                        result["message"] += f"成功获取{date_str}的{len(items)}条股票数据。"
                    else:
                        logging.info(f"{date_str}没有股票数据")
                        result["message"] += f"{date_str}没有股票数据。"
                else:
                    logging.error(f"API返回错误: {data.get('message', '未知错误')}")
                    result["status"] = "error"
                    result["message"] += f"API返回错误: {data.get('message', '未知错误')}。"
                    
            except requests.exceptions.RequestException as e:
                logging.error(f"请求API失败: {e}")
                result["status"] = "error"
                result["message"] += f"请求API失败: {e}。"
            except Exception as e:
                logging.error(f"处理数据时出错: {e}")
                result["status"] = "error"
                result["message"] += f"处理数据时出错: {e}。"
        else:
            date_str = format_date(current_date)
            logging.info(f"{date_str}是周末，跳过抓取")
            result["message"] += f"{date_str}是周末，跳过抓取。"
        
        if crawl_today_only:
            # 如果只抓取今天的数据，循环一次就退出
            break
        else:
            # 日期加1天（无论是否处理了当前日期，都会递增）
            current_date += datetime.timedelta(days=1)
    
    return result

def process_and_store_data(date_str, items):
    """处理股票数据并存储到数据库"""
    processed_data = []
    total_items = len(items)
    logging.info(f"开始处理{date_str}的{total_items}条股票数据")
    
    for index, item in enumerate(items):
        try:
            # 验证item是否为列表且长度足够
            if not isinstance(item, list):
                logging.error(f"第{index+1}条数据不是列表格式: {item}")
                continue
                
            if len(item) < 12:
                logging.error(f"第{index+1}条数据字段不足12个: {item}")
                continue
            
            # 提取需要的数据字段并进行验证
            code = item[0]  # 股票代码
            if not code:
                logging.error(f"第{index+1}条数据缺少股票代码: {item}")
                continue
                
            name = item[1]  # 股票名称
            if not name:
                logging.error(f"第{index+1}条数据缺少股票名称: {item}")
                continue
                
            # 解读字段，可能为空
            description = item[5] if len(item) > 5 else ""
            
            # 处理所属题材，可能有多个值，用顿号隔开
            plates = item[8] if len(item) > 8 else []
            plate_names = ""
            if isinstance(plates, list):
                try:
                    plate_names = "、".join(plate["name"] for plate in plates if isinstance(plate, dict) and "name" in plate)
                except Exception as e:
                    logging.error(f"第{index+1}条数据处理题材时出错: {e}, 题材数据: {plates}")
            
            # 几天几板，可能为空
            m_days_n_boards = item[11] if len(item) > 11 else ""
            
            # 添加到处理后的数据列表
            processed_data.append({
                "code": code,
                "name": name,
                "description": description,
                "plates": plate_names,
                "m_days_n_boards": m_days_n_boards,
                "date": date_str
            })
            
        except Exception as e:
            logging.error(f"处理第{index+1}条股票数据时出错: {e}, 数据项: {item}")
    
    # 存储到数据库
    if processed_data:
        logging.info(f"处理完成，共处理{len(processed_data)}条有效数据，准备存储到数据库")
        db.store_stock_data(date_str, processed_data)
        logging.info(f"已将{date_str}的{len(processed_data)}条股票数据存储到数据库")
    else:
        logging.warning(f"{date_str}没有有效数据可以存储")

if __name__ == "__main__":
    crawl_stock_data()