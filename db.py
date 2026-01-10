import sqlite3
import os
import logging
import time
from pypinyin import lazy_pinyin, Style

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 数据库文件路径
# 在Vercel环境中使用临时目录
import os
if os.environ.get('VERCEL'):
    # Vercel环境
    DB_PATH = os.path.join(os.getcwd(), "stock_data.db")
else:
    # 本地环境
    DB_PATH = "stock_data.db"

def init_db():
    """初始化数据库"""
    conn = None
    try:
        # 连接数据库
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 创建表的函数（会在存储数据时调用）
        logging.info("数据库初始化完成")
        
    except Exception as e:
        logging.error(f"数据库初始化失败: {e}")
    finally:
        if conn:
            conn.close()

def create_table(date_str):
    """为指定日期创建股票数据表"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 表名使用日期，例如：stock_20251201
        table_name = f"stock_{date_str}"
        
        # 创建表结构
        cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            plates TEXT,
            m_days_n_boards TEXT,
            date TEXT NOT NULL,
            price REAL DEFAULT 0,
            change_percentage REAL DEFAULT 0,
            amount REAL DEFAULT 0,
            value REAL DEFAULT 0
        )
        ''')
        
        # 添加索引以加速搜索查询
        try:
            cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_name ON {table_name}(name)")
            cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_plates ON {table_name}(plates)")
            cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_code ON {table_name}(code)")
        except Exception as e:
            logging.warning(f"创建索引失败: {e}")
        
        conn.commit()
        logging.info(f"成功创建表: {table_name}")
        
    except Exception as e:
        logging.error(f"创建表失败: {e}")
    finally:
        conn.close()

def store_stock_data(date_str, stock_data):
    """将股票数据存储到数据库（去重）"""
    # 创建表
    create_table(date_str)
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        table_name = f"stock_{date_str}"
        
        # 1. 先对新抓取的数据进行去重，按股票名称分组，保留plates内容较多的记录
        name_to_stock = {}
        for stock in stock_data:
            name = stock["name"]
            if name not in name_to_stock:
                name_to_stock[name] = stock
            else:
                # 比较plates长度，保留内容较多的
                current_plates_len = len(name_to_stock[name]["plates"])
                new_plates_len = len(stock["plates"])
                if new_plates_len > current_plates_len:
                    name_to_stock[name] = stock
        
        # 2. 查询数据库中已有的数据，按股票名称分组
        existing_data = {}
        try:
            cursor.execute(f"SELECT code, name, description, plates, m_days_n_boards, date, price, change_percentage, amount, value FROM {table_name}")
            rows = cursor.fetchall()
            for row in rows:
                name = row[1]
                existing_stock = {
                    "code": row[0],
                    "name": row[1],
                    "description": row[2],
                    "plates": row[3],
                    "m_days_n_boards": row[4],
                    "date": row[5],
                    "price": row[6],
                    "change_percentage": row[7],
                    "amount": row[8],
                    "value": row[9]
                }
                existing_data[name] = existing_stock
        except Exception as e:
            logging.warning(f"查询已有数据失败: {e}")
            existing_data = {}
        
        # 3. 准备需要插入和更新的数据
        to_insert = []
        to_update = []
        
        for name, new_stock in name_to_stock.items():
            if name in existing_data:
                # 比较plates长度，决定是否更新
                existing_plates_len = len(existing_data[name]["plates"])
                new_plates_len = len(new_stock["plates"])
                if new_plates_len > existing_plates_len:
                    to_update.append(new_stock)
            else:
                # 新记录，插入
                to_insert.append(new_stock)
        
        # 4. 执行插入操作
        if to_insert:
            insert_sql = f'''
            INSERT INTO {table_name} (code, name, description, plates, m_days_n_boards, date, price, change_percentage, amount, value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            '''
            insert_values = [(s["code"], s["name"], s["description"], s["plates"], s["m_days_n_boards"], s["date"], 
                             s.get("price", 0), s.get("change_percentage", 0), s.get("amount", 0), s.get("value", 0)) for s in to_insert]
            cursor.executemany(insert_sql, insert_values)
            logging.info(f"成功插入{len(to_insert)}条新数据到表{table_name}")
        
        # 5. 执行更新操作
        if to_update:
            update_sql = f'''
            UPDATE {table_name} SET code=?, description=?, plates=?, m_days_n_boards=?, price=?, change_percentage=?, amount=?, value=? WHERE name=?
            '''
            update_values = [(s["code"], s["description"], s["plates"], s["m_days_n_boards"], 
                             s.get("price", 0), s.get("change_percentage", 0), s.get("amount", 0), s.get("value", 0), 
                             s["name"]) for s in to_update]
            cursor.executemany(update_sql, update_values)
            logging.info(f"成功更新{len(to_update)}条数据到表{table_name}")
        
        conn.commit()
        total_processed = len(to_insert) + len(to_update)
        logging.info(f"总共处理了{total_processed}条数据（插入{len(to_insert)}条，更新{len(to_update)}条）")
        
    except Exception as e:
        logging.error(f"存储数据失败: {e}")
    finally:
        conn.close()

def get_all_stock_data():
    """获取所有日期的股票数据，按日期降序排列（去重）"""
    stock_dict = {}  # 使用字典去重，键为 code+date
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 获取所有股票表，并按日期降序排列
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stock_%' ORDER BY name DESC")
        tables = cursor.fetchall()
        
        # 定义需要过滤的关键词（JavaScript代码特征）
        filter_keywords = ['function', 'var ', 'const ', 'let ', 'return ', 'if (', 'else {', 'console.log', '// ', 'document.', 'fetch(', '.then(', '.catch(']
        
        def is_valid_description(desc):
            """检查description是否有效（不包含JavaScript代码）"""
            if not desc:
                return True
            desc_lower = desc.lower()
            for keyword in filter_keywords:
                if keyword in desc_lower:
                    return False
            return True
        
        # 遍历所有表，获取数据
        for table in tables:
            table_name = table[0]
            
            # 获取表中的所有数据
            cursor.execute(f"SELECT DISTINCT code, name, description, plates, m_days_n_boards, date FROM {table_name}")
            rows = cursor.fetchall()
            
            # 转换为字典格式
            for row in rows:
                code = row[0]
                date = row[5]
                description = row[2]
                
                # 过滤掉包含JavaScript代码的description
                if not is_valid_description(description):
                    continue
                
                unique_key = f"{code}_{date}"
                
                # 如果已经存在相同的键，跳过
                if unique_key in stock_dict:
                    continue
                
                code_part = code
                market = ""
                
                # 分割股票代码和市场
                if "." in code:
                    code_part, market = code.split(".")
                
                # 添加到字典中
                stock_dict[unique_key] = {
                    "code": code,
                    "code_part": code_part,
                    "market": market,
                    "name": row[1],
                    "description": description,
                    "plates": row[3],
                    "m_days_n_boards": row[4],
                    "date": date
                }
        
        # 转换为列表
        all_stocks = list(stock_dict.values())
        logging.info(f"成功获取{len(all_stocks)}条去重后的股票数据")
        
    except Exception as e:
        logging.error(f"获取数据失败: {e}")
    finally:
        conn.close()
    
    return all_stocks

def get_stock_data_by_date(date_str):
    """获取指定日期的股票数据（已去重）"""
    stock_dict = {}  # 使用字典去重，键为 code+date
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        table_name = f"stock_{date_str}"
        
        # 检查表是否存在
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
        if cursor.fetchone():
            # 定义需要过滤的关键词（JavaScript代码特征）
            filter_keywords = ['function', 'var ', 'const ', 'let ', 'return ', 'if (', 'else {', 'console.log', '// ', 'document.', 'fetch(', '.then(', '.catch(']
            
            def is_valid_description(desc):
                """检查description是否有效（不包含JavaScript代码）"""
                if not desc:
                    return True
                desc_lower = desc.lower()
                for keyword in filter_keywords:
                    if keyword in desc_lower:
                        return False
                return True
            
            # 获取表中的所有数据
            cursor.execute(f"SELECT code, name, description, plates, m_days_n_boards, date FROM {table_name}")
            rows = cursor.fetchall()
            
            # 转换为字典格式并去重
            for row in rows:
                code = row[0]
                date = row[5]
                description = row[2]
                
                # 过滤掉包含JavaScript代码的description
                if not is_valid_description(description):
                    continue
                
                unique_key = f"{code}_{date}"
                
                # 如果已经存在相同的键，跳过
                if unique_key in stock_dict:
                    continue
                
                code_part = code
                market = ""
                
                # 分割股票代码和市场
                if "." in code:
                    code_part, market = code.split(".")
                
                stock_dict[unique_key] = {
                    "code": code,
                    "code_part": code_part,
                    "market": market,
                    "name": row[1],
                    "description": description,
                    "plates": row[3],
                    "m_days_n_boards": row[4],
                    "date": date
                }
        
        # 将字典值转换为列表
        stocks = list(stock_dict.values())
        
        # 应用新的排序规则：按照题材数量和同一题材股票数量排序
        sorted_stocks = sort_stocks_by_plates(stocks)
        
        logging.info(f"成功获取{date_str}的{len(sorted_stocks)}条去重后的股票数据，并完成排序")
        
    except Exception as e:
        logging.error(f"获取{date_str}的数据失败: {e}")
        sorted_stocks = []
    finally:
        conn.close()
    
    return sorted_stocks

def get_all_stock_names_and_codes():
    """获取所有股票名称和代码，用于搜索提示"""
    stock_info = set()  # 使用set避免重复，存储(name, code)元组
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 获取所有股票表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stock_%'")
        tables = cursor.fetchall()
        
        # 遍历所有表，获取股票名称和代码
        for table in tables:
            table_name = table[0]
            
            # 获取表中的所有股票名称和代码
            cursor.execute(f"SELECT DISTINCT name, code FROM {table_name}")
            data = cursor.fetchall()
            
            # 将股票名称和代码添加到set中
            for item in data:
                stock_info.add((item[0], item[1]))
        
        logging.info(f"成功获取{len(stock_info)}个不重复的股票名称和代码")
        
    except Exception as e:
        logging.error(f"获取股票名称和代码失败: {e}")
    finally:
        conn.close()
    
    return list(stock_info)

def date_has_data(date_str):
    """检查指定日期是否已有数据"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 检查对应的表是否存在
        table_name = f"stock_{date_str}"
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
        
        if cursor.fetchone():
            # 检查表中是否有数据（超过0条视为有数据）
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            return count > 0
        return False
        
    except Exception as e:
        logging.error(f"检查日期{date_str}是否有数据失败: {e}")
        return False
    finally:
        conn.close()

def get_available_dates():
    """获取所有有数据的日期列表"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 获取所有股票表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stock_%' ORDER BY name DESC")
        tables = cursor.fetchall()
        
        available_dates = []
        for table in tables:
            table_name = table[0]
            # 从表名中提取日期部分，格式为YYYYMMDD
            date_str = table_name.replace('stock_', '')
            
            # 检查表中是否有数据
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            
            if count > 0:
                available_dates.append(date_str)
        
        logging.info(f"成功获取{len(available_dates)}个有数据的日期")
        return available_dates
        
    except Exception as e:
        logging.error(f"获取有数据的日期列表失败: {e}")
        return []
    finally:
        conn.close()

# 题材计数缓存
plate_counts_cache = {
    'data': {},
    'timestamp': 0,
    'cache_duration': 30000  # 缓存30秒
}

def sort_stocks_by_plates(stocks):
    """按照题材数量和同一题材股票数量对股票数据进行排序
    1. 题材数量多的股票排在前面
    2. 同一题材股票数量多的排在前面
    """
    if not stocks:
        return []
    
    # 检查缓存是否有效
    current_time = time.time() * 1000
    if (current_time - plate_counts_cache['timestamp'] < plate_counts_cache['cache_duration'] and 
        plate_counts_cache['data']):
        # 使用缓存的题材计数
        plate_counts = plate_counts_cache['data']
    else:
        # 获取所有股票数据来统计题材出现次数
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 统计每个题材出现的总次数（基于所有股票）
        plate_counts = {}
        
        try:
            # 获取最新的几个股票表（只统计最近的10个表，减少计算量）
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stock_%' ORDER BY name DESC LIMIT 10")
            tables = cursor.fetchall()
            
            # 遍历表，统计题材出现次数
            for table in tables:
                table_name = table[0]
                
                # 查询表中的所有数据
                cursor.execute(f"SELECT plates FROM {table_name}")
                rows = cursor.fetchall()
                
                # 统计每个题材的出现次数
                for row in rows:
                    plates = row[0]
                    if plates:
                        plate_list = plates.split('、')
                        for plate in plate_list:
                            plate_counts[plate] = plate_counts.get(plate, 0) + 1
        finally:
            conn.close()
        
        # 更新缓存
        plate_counts_cache['data'] = plate_counts
        plate_counts_cache['timestamp'] = current_time
    
    # 创建一个列表，包含股票和它们的排序键
    stocks_with_keys = []
    for stock in stocks:
        plates = stock.get('plates', '')
        if plates:
            # 计算题材数量
            plate_list = plates.split('、')
            plate_count = len(plate_list)
            
            # 计算该股票所属题材的总出现次数
            total_plate_occurrences = sum(plate_counts.get(plate, 0) for plate in plate_list)
        else:
            # 没有题材的股票排在最后
            plate_count = 0
            total_plate_occurrences = 0
        
        # 存储股票和排序键
        stocks_with_keys.append((
            stock,  # 股票数据
            (-plate_count, -total_plate_occurrences)  # 排序键
        ))
    
    # 排序
    stocks_with_keys.sort(key=lambda x: x[1])
    
    # 提取排序后的股票
    sorted_stocks = [stock for stock, key in stocks_with_keys]
    
    return sorted_stocks

def get_latest_day_data():
    """获取最新一天的数据"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 获取最新的股票表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stock_%' ORDER BY name DESC LIMIT 1")
        latest_table = cursor.fetchone()
        
        if not latest_table:
            logging.info("没有找到最新的股票表")
            return []
        
        table_name = latest_table[0]
        
        # 定义需要过滤的关键词（JavaScript代码特征）
        filter_keywords = ['function', 'var ', 'const ', 'let ', 'return ', 'if (', 'else {', 'console.log', '// ', 'document.', 'fetch(', '.then(', '.catch(']
        
        def is_valid_description(desc):
            """检查description是否有效（不包含JavaScript代码）"""
            if not desc:
                return True
            desc_lower = desc.lower()
            for keyword in filter_keywords:
                if keyword in desc_lower:
                    return False
            return True
        
        # 获取最新一天的数据，尝试使用包含新字段的查询
        try:
            # 尝试查询包含新字段的语句
            cursor.execute(f"SELECT DISTINCT code, name, description, plates, m_days_n_boards, date, price, change_percentage, amount, value FROM {table_name}")
            rows = cursor.fetchall()
            
            # 转换为字典格式
            stocks = []
            for row in rows:
                code = row[0]
                description = row[2]
                
                # 过滤掉包含JavaScript代码的description
                if not is_valid_description(description):
                    continue
                
                code_part = code
                market = ""
                
                # 分割股票代码和市场
                if "." in code:
                    code_part, market = code.split(".")
                
                stocks.append({
                    "code": code,
                    "code_part": code_part,
                    "market": market,
                    "name": row[1],
                    "description": description,
                    "plates": row[3],
                    "m_days_n_boards": row[4],
                    "date": row[5],
                    "price": row[6],
                    "change_percentage": row[7],
                    "amount": row[8],
                    "value": row[9]
                })
        except Exception as e:
            logging.warning(f"查询包含新字段的语句失败，尝试使用旧字段查询: {e}")
            # 如果失败，尝试查询不包含新字段的语句
            cursor.execute(f"SELECT DISTINCT code, name, description, plates, m_days_n_boards, date FROM {table_name}")
            rows = cursor.fetchall()
            
            # 转换为字典格式
            stocks = []
            for row in rows:
                code = row[0]
                description = row[2]
                
                # 过滤掉包含JavaScript代码的description
                if not is_valid_description(description):
                    continue
                
                code_part = code
                market = ""
                
                # 分割股票代码和市场
                if "." in code:
                    code_part, market = code.split(".")
                
                stocks.append({
                    "code": code,
                    "code_part": code_part,
                    "market": market,
                    "name": row[1],
                    "description": description,
                    "plates": row[3],
                    "m_days_n_boards": row[4],
                    "date": row[5],
                    "price": 0,
                    "change_percentage": 0,
                    "amount": 0,
                    "value": 0
                })
        
        # 按照题材数量和同一题材股票数量排序
        sorted_stocks = sort_stocks_by_plates(stocks)
        
        logging.info(f"成功获取最新一天{table_name.replace('stock_', '')}的{len(sorted_stocks)}条股票数据")
        return sorted_stocks
        
    except Exception as e:
        logging.error(f"获取最新一天的数据失败: {e}")
        return []
    finally:
        conn.close()

def search_stocks_by_keyword(keyword):
    """根据关键词搜索所有日期的股票数据，并按日期降序排列"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 获取所有股票表，并按日期降序排列
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stock_%' ORDER BY name DESC")
        tables = cursor.fetchall()
        
        # 搜索结果列表（包含所有符合条件的记录，不按股票代码去重）
        search_results = []
        
        # 定义需要过滤的关键词（JavaScript代码特征）
        filter_keywords = ['function', 'var ', 'const ', 'let ', 'return ', 'if (', 'else {', 'console.log', '// ', 'document.', 'fetch(', '.then(', '.catch(']
        
        def is_valid_description(desc):
            """检查description是否有效（不包含JavaScript代码）"""
            if not desc:
                return True
            desc_lower = desc.lower()
            for keyword in filter_keywords:
                if keyword in desc_lower:
                    return False
            return True
        
        # 遍历所有表，搜索符合条件的数据
        for table in tables:
            table_name = table[0]
            
            # 构建搜索SQL，增加对code字段的搜索
            search_sql = f"""
            SELECT DISTINCT code, name, description, plates, m_days_n_boards, date 
            FROM {table_name} 
            WHERE name LIKE ? OR description LIKE ? OR plates LIKE ? OR code LIKE ?
            """
            
            # 执行搜索
            cursor.execute(search_sql, (f"%{keyword}%", f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"))
            rows = cursor.fetchall()
            
            # 转换为字典格式
            for row in rows:
                code = row[0]
                description = row[2]
                
                # 过滤掉包含JavaScript代码的description
                if not is_valid_description(description):
                    continue
                
                code_part = code
                market = ""
                
                # 分割股票代码和市场
                if "." in code:
                    code_part, market = code.split(".")
                
                search_results.append({
                    "code": code,
                    "code_part": code_part,
                    "market": market,
                    "name": row[1],
                    "description": description,
                    "plates": row[3],
                    "m_days_n_boards": row[4],
                    "date": row[5]
                })
        
        
        # 应用新的排序规则：按照题材数量和同一题材股票数量排序
        sorted_results = sort_stocks_by_plates(search_results)
        
        logging.info(f"成功搜索到{len(search_results)}条去重后的股票数据，并完成排序")
        
    except Exception as e:
        logging.error(f"搜索股票数据失败: {e}")
        sorted_results = []
    finally:
        conn.close()
    
    return sorted_results

def search_stocks_by_plate(plate):
    """根据题材搜索股票数据，支持模糊匹配和拼音搜索"""
    if not plate:
        return []
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 获取所有股票表，并按日期降序排列
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stock_%' ORDER BY name DESC")
        tables = cursor.fetchall()
        
        # 使用字典去重，确保每个股票只保留最新日期的记录
        # 键: 股票代码, 值: 股票数据
        unique_stocks = {}
        
        # 定义需要过滤的关键词（JavaScript代码特征）
        filter_keywords = ['function', 'var ', 'const ', 'let ', 'return ', 'if (', 'else {', 'console.log', '// ', 'document.', 'fetch(', '.then(', '.catch(']
        
        def is_valid_description(desc):
            """检查description是否有效（不包含JavaScript代码）"""
            if not desc:
                return True
            desc_lower = desc.lower()
            for keyword in filter_keywords:
                if keyword in desc_lower:
                    return False
            return True
        
        # 遍历所有表，搜索符合条件的数据
        for table in tables:
            table_name = table[0]
            
            # 构建搜索SQL，先使用SQL过滤包含关键词的记录
            search_sql = f"""
            SELECT DISTINCT code, name, description, plates, m_days_n_boards, date 
            FROM {table_name}
            WHERE plates LIKE ?
            """
            
            # 执行搜索（SQL层面的模糊匹配）
            cursor.execute(search_sql, (f"%{plate}%",))
            rows = cursor.fetchall()
            
            # 转换为字典格式并进行去重
            for row in rows:
                code = row[0]
                stock_plates = row[3]
                description = row[2]
                
                # 过滤掉包含JavaScript代码的description
                if not is_valid_description(description):
                    continue
                
                # 如果该股票已经在结果中（已有最新日期的记录），则跳过
                if code in unique_stocks:
                    continue
                
                # 分割股票代码和市场
                code_part = code
                market = ""
                if "." in code:
                    code_part, market = code.split(".")
                
                # 添加到去重字典中
                unique_stocks[code] = {
                    "code": code,
                    "code_part": code_part,
                    "market": market,
                    "name": row[1],
                    "description": description,
                    "plates": stock_plates,
                    "m_days_n_boards": row[4],
                    "date": row[5]
                }
        
        # 将去重后的结果转换为列表
        search_results = list(unique_stocks.values())
        
        # 应用新的排序规则：按照题材数量和同一题材股票数量排序
        sorted_results = sort_stocks_by_plates(search_results)
        
        logging.info(f"成功搜索到{len(search_results)}条去重后的股票数据，并完成排序")
        
    except Exception as e:
        logging.error(f"搜索股票数据失败: {e}")
        sorted_results = []
    finally:
        conn.close()
    
    return sorted_results

def get_stock_history_data(stock_code):
    """根据股票代码获取该股票的历史上榜数据"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 获取所有股票表，并按日期降序排列
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stock_%' ORDER BY name DESC")
        tables = cursor.fetchall()
        
        # 历史数据列表
        history_data = []
        
        # 遍历所有表，获取该股票的数据
        for table in tables:
            table_name = table[0]
            
            # 构建查询SQL
            query_sql = f"""
            SELECT DISTINCT code, name, description, plates, m_days_n_boards, date 
            FROM {table_name} 
            WHERE code LIKE ?
            """
            
            # 执行查询
            cursor.execute(query_sql, (f"%{stock_code}%",))
            rows = cursor.fetchall()
            
            # 转换为字典格式
            for row in rows:
                code = row[0]
                
                code_part = code
                market = ""
                
                # 分割股票代码和市场
                if "." in code:
                    code_part, market = code.split(".")
                
                history_data.append({
                    "code": code,
                    "code_part": code_part,
                    "market": market,
                    "name": row[1],
                    "description": row[2],
                    "plates": row[3],
                    "m_days_n_boards": row[4],
                    "date": row[5]
                })
        
        logging.info(f"成功获取股票{stock_code}的{len(history_data)}条历史数据")
        
    except Exception as e:
        logging.error(f"获取股票历史数据失败: {e}")
        history_data = []
    finally:
        conn.close()
    
    return history_data