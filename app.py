from flask import Flask, render_template, request, jsonify, make_response, redirect, url_for, session
import crawler
import db
import os
import requests
import logging
import hashlib
import time
import random
from pypinyin import lazy_pinyin, FIRST_LETTER
from apscheduler.schedulers.background import BackgroundScheduler
import datetime
from datetime import datetime, timedelta

app = Flask(__name__)

# 缓存字典，用于存储临时数据
cache = {}

def get_cache(key):
    """获取缓存数据"""
    if key in cache:
        data, expiry = cache[key]
        if time.time() < expiry:
            return data
        else:
            # 缓存过期，删除
            del cache[key]
    return None

def set_cache(key, data, ttl):
    """设置缓存数据"""
    expiry = time.time() + ttl
    cache[key] = (data, expiry)

# 设置secret_key以支持session
app.config['SECRET_KEY'] = 'your-secret-key-change-this-in-production'

@app.route('/')
def index():
    # 默认只显示最新一天的数据
    latest_data = db.get_latest_day_data()
    
    # 从session中获取消息（如果有的话）
    message = session.pop('message', None)
    
    return render_template('index.html', stocks=latest_data, search_mode=False, message=message)

@app.route('/crawl', methods=['POST'])
def crawl_data():
    # 触发数据抓取，强制更新最新数据，绕过时间检查
    result = crawler.crawl_stock_data(crawl_today_only=True, force_update=True, bypass_time_check=True)
    
    # 将抓取结果存储在session中
    if result['status'] == 'success':
        session['message'] = f"数据抓取完成！共处理{len(result['dates_processed'])}个日期，获取了{result['total_data']}条数据。"
    else:
        session['message'] = f"数据抓取失败：{result['message']}"
    
    # 重定向回首页
    return redirect(url_for('index'))

@app.route('/search')
def search_stocks():
    # 获取搜索关键词
    keyword = request.args.get('keyword', '').strip()
    
    if not keyword:
        return jsonify([])
    
    try:
        # 使用search_stocks_by_keyword获取所有匹配的股票数据
        # 这个函数已经包含了对name、description、plates和code字段的模糊匹配
        matched_stocks = db.search_stocks_by_keyword(keyword)
        
        # 从搜索结果中提取股票名称
        stock_names = []
        seen_names = set()
        
        for stock in matched_stocks:
            name = stock['name']
            if name not in seen_names:
                seen_names.add(name)
                stock_names.append(name)
        
        # 如果没有结果，再尝试拼音搜索作为补充
        if not stock_names:
            all_stock_info = db.get_all_stock_names_and_codes()
            matched_results = []
            
            for name, code in all_stock_info:
                # 转换为拼音首字母
                pinyin = ''.join(lazy_pinyin(name))
                # 转换为拼音首字母缩写
                pinyin_abbr = ''.join(lazy_pinyin(name, style=FIRST_LETTER))
                
                # 计算匹配度分数
                score = 0
                if keyword in name:
                    score += 100  # 名称完全匹配权重最高
                if keyword.lower() in pinyin.lower():
                    score += 50   # 拼音匹配权重次之
                if keyword.lower() in pinyin_abbr.lower():
                    score += 30   # 拼音缩写匹配权重再次之
                if keyword in code:
                    score += 80   # 代码匹配权重较高
                
                # 如果有匹配，添加到结果列表
                if score > 0:
                    matched_results.append((name, score))
            
            # 按匹配度分数降序排序
            matched_results.sort(key=lambda x: x[1], reverse=True)
            
            # 提取排序后的股票名称（去重）
            for name, score in matched_results:
                if name not in seen_names:
                    seen_names.add(name)
                    stock_names.append(name)
        
        # 返回排序后的所有匹配结果
        return jsonify(stock_names)
        
    except Exception as e:
        logging.error(f"搜索股票失败: {e}")
        return jsonify([])

@app.route('/search-results')
def search_results():
    # 获取搜索关键词
    keyword = request.args.get('keyword', '').strip()
    
    if not keyword:
        # 如果没有关键词，返回最新一天的数据
        latest_data = db.get_latest_day_data()
        return render_template('index.html', stocks=latest_data, search_mode=False)
    
    # 首先使用基本的关键词搜索
    search_results = db.search_stocks_by_keyword(keyword)
    
    # 如果没有结果，再尝试拼音搜索作为补充
    if not search_results:
        all_stock_info = db.get_all_stock_names_and_codes()
        matched_codes = set()
        
        for name, code in all_stock_info:
            # 转换为拼音
            pinyin = ''.join(lazy_pinyin(name))
            # 转换为拼音首字母缩写
            pinyin_abbr = ''.join(lazy_pinyin(name, style=FIRST_LETTER))
            
            # 检查是否匹配
            if (keyword.lower() in pinyin.lower() or 
                keyword.lower() in pinyin_abbr.lower()):
                matched_codes.add(code)
        
        # 如果有匹配的代码，搜索这些代码的所有数据
        if matched_codes:
            search_results = []
            for code in matched_codes:
                # 搜索该代码的所有数据
                code_results = db.search_stocks_by_keyword(code)
                search_results.extend(code_results)
    return render_template('index.html', stocks=search_results, search_mode=True, search_keyword=keyword)

@app.route('/get-data-by-date')
def get_data_by_date():
    # 获取指定日期
    date_str = request.args.get('date', '').strip()
    
    if not date_str:
        return jsonify([])
    
    # 获取指定日期的数据
    data = db.get_stock_data_by_date(date_str)
    return jsonify(data)

@app.route('/available-dates')
def get_available_dates():
    # 获取所有有数据的日期
    dates = db.get_available_dates()
    
    # 创建响应并设置缓存头
    response = make_response(jsonify(dates))
    response.headers['Cache-Control'] = 'public, max-age=300'  # 缓存5分钟
    
    # 生成ETag
    data_str = str(dates)
    etag = hashlib.md5(data_str.encode()).hexdigest()
    response.headers['ETag'] = etag
    
    return response

@app.route('/stock/<stock_code>')
def stock_detail(stock_code):
    # 获取股票历史数据
    history_data = db.get_stock_history_data(stock_code)
    return render_template('stock_detail.html', stock_code=stock_code, history_data=history_data)

@app.route('/zqtc_tdx')
def zqtc_tdx():
    # 显示最强题材解读页面
    return render_template('zqtc_tdx.html')

@app.route('/api/realtime-stock-data')
def get_realtime_stock_data():
    # 获取请求参数中的股票代码列表
    symbols = request.args.get('symbols', '')
    if not symbols:
        return jsonify({'error': '缺少股票代码参数'}), 400
    
    try:
        # 构建API请求URL
        api_url = f'https://stock.xueqiu.com/v5/stock/realtime/quotec.json?symbol={symbols}'
        
        # 设置请求头，模拟浏览器请求
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://xueqiu.com/'
        }
        
        # 发送请求获取数据
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()  # 抛出HTTP错误
        
        # 返回获取到的数据并设置缓存头
        result = response.json()
        api_response = make_response(jsonify(result))
        api_response.headers['Cache-Control'] = 'public, max-age=60'  # 缓存1分钟
        return api_response
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'请求失败: {str(e)}'}), 500

@app.route('/filter-by-plate')
def filter_by_plate():
    # 获取请求参数中的题材名称
    plate = request.args.get('plate', '')
    if not plate:
        return jsonify([])
    
    try:
        # 根据题材搜索股票数据
        filtered_stocks = db.search_stocks_by_plate(plate)
        return jsonify(filtered_stocks)
    except Exception as e:
        logging.error(f"筛选股票数据失败: {e}")
        return jsonify([])

@app.route('/api/filter-plate-all-dates')
def filter_plate_all_dates():
    # 获取请求参数中的题材名称
    plate = request.args.get('plate', '')
    if not plate:
        return jsonify([])
    
    try:
        # 根据题材搜索股票数据
        filtered_stocks = db.search_stocks_by_plate(plate)
        return jsonify(filtered_stocks)
    except Exception as e:
        logging.error(f"筛选股票数据失败: {e}")
        return jsonify([])

@app.route('/api/time-sharing-data')
def get_time_sharing_data():
    # 获取请求参数中的股票代码
    code = request.args.get('code', '').strip()
    if not code:
        return jsonify({'error': '缺少股票代码参数'}), 400
    
    # 生成缓存键
    cache_key = f'time_sharing:{code}'
    
    # 禁用缓存，每次都获取新数据
    # cached_data = get_cache(cache_key)
    # if cached_data:
    #     # 创建响应并设置缓存头
    #     response = make_response(jsonify(cached_data))
    #     response.headers['Cache-Control'] = 'public, max-age=60'  # 缓存1分钟
    #     return response
    
    try:
        # 验证股票代码格式
        if not code.isdigit() or len(code) < 5 or len(code) > 6:
            return jsonify({'error': f'无效的股票代码: {code}'}), 400
        
        # 尝试使用东方财富API
        try:
            data = fetch_eastmoney_data(code)
            if data:
                # 缓存数据
                set_cache(cache_key, data, 5)  # 缓存5秒
                # 创建响应并设置缓存头
                api_response = make_response(jsonify(data))
                api_response.headers['Cache-Control'] = 'public, max-age=5'  # 缓存5秒
                api_response.headers['Access-Control-Allow-Origin'] = '*'  # 允许跨域
                return api_response
        except Exception as e:
            print(f"东方财富API请求失败: {str(e)}")
            return jsonify({'error': f'东方财富API请求失败: {str(e)}'}), 500
        
        # 如果东方财富API失败，返回错误信息
        return jsonify({'error': '无法获取东方财富数据'}), 500
    except Exception as e:
        # 记录详细错误信息
        print(f"处理分时数据失败: {code}, 错误: {str(e)}")
        # 返回错误信息，而不是空数据
        return jsonify({'error': f'处理失败: {str(e)}'}), 500

@app.route('/api/proxy-eastmoney')
def proxy_eastmoney():
    """东方财富API代理，直接返回原始数据"""
    code = request.args.get('code', '').strip()
    if not code:
        return jsonify({'error': '缺少股票代码参数'}), 400
    
    # 生成secid
    if code[0] == '6':
        market = '1'
    elif code[0] == '0' or code[0] == '3':
        market = '0'
    else:
        return jsonify({'error': '不支持的股票代码'}), 400
    
    secid = f"{market}.{code}"
    api_url = f'https://push2.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f8,f10&fields2=f51,f53,f56,f58&secid={secid}&ndays=1&iscr=0&iscca=0'
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6,zh-TW;q=0.5',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Host': 'push2.eastmoney.com',
        'Sec-Ch-Ua': '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://quote.eastmoney.com/'
    }
    
    try:
        session = requests.Session()
        session.headers.update(headers)
        
        # 先访问首页获取cookie
        session.get('https://quote.eastmoney.com/', timeout=10, verify=False)
        
        # 再请求分时数据
        response = session.get(api_url, timeout=10, verify=False)
        response.raise_for_status()
        data = response.json()
        
        # 直接返回东方财富的响应，添加CORS头
        resp = make_response(data)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return resp
    except Exception as e:
        print(f"东方财富API代理请求失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def fetch_eastmoney_data(code):
    """从东方财富API获取分时数据"""
    # 根据股票代码生成secid参数
    if code[0] == '6':
        market = '1'  # 沪市
    elif code[0] == '0' or code[0] == '3':
        market = '0'  # 深市
    else:
        return None
    
    secid = f"{market}.{code}"
    
    # 构建API请求URL
    api_url = f'https://push2.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f8,f10&fields2=f51,f53,f56,f58&secid={secid}&ndays=1&iscr=0&iscca=0'
    
    # 设置请求头，完整模拟浏览器请求
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6,zh-TW;q=0.5',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Host': 'push2.eastmoney.com',
        'Sec-Ch-Ua': '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    }
    
    # 创建会话
    session = requests.Session()
    session.headers.update(headers)
    
    # 发送请求获取数据（不需要先访问首页）
    response = session.get(api_url, timeout=10, verify=False)
    response.raise_for_status()  # 抛出HTTP错误
    
    # 解析响应数据
    result = response.json()
    
    return result

def fetch_sina_data(code):
    """从新浪财经API获取股票数据"""
    # 根据股票代码生成新浪财经的市场代码
    if code[0] == '6':
        market = 'sh'  # 沪市
    elif code[0] == '0' or code[0] == '3':
        market = 'sz'  # 深市
    else:
        return None
    
    # 构建新浪财经API请求URL
    api_url = f'http://hq.sinajs.cn/list={market}{code}'
    
    # 设置请求头，模拟浏览器请求
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://finance.sina.com.cn/',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive'
    }
    
    # 发送请求获取数据
    response = requests.get(api_url, headers=headers, timeout=10, verify=False)
    response.raise_for_status()  # 抛出HTTP错误
    
    # 解析新浪财经的响应数据
    content = response.text
    
    # 提取数据
    import re
    match = re.search(r'="(.*?)"', content)
    if not match:
        return {'rc': 0, 'data': {'preClose': 0, 'trends': []}}
    
    data_str = match.group(1)
    data_list = data_str.split(',')
    
    if len(data_list) < 3:
        return {'rc': 0, 'data': {'preClose': 0, 'trends': []}}
    
    # 提取昨收价
    preClose = data_list[2]
    
    # 生成模拟的分时数据
    # 注意：新浪财经API不提供完整的分时数据，这里使用模拟数据
    # 实际应用中，可能需要使用其他数据源或API
    trends = []
    currentPrice = float(data_list[3])  # 当前价
    now = datetime.now()
    year = now.year
    month = str(now.month).zfill(2)
    day = str(now.day).zfill(2)
    
    # 生成9:30-11:30的数据
    for hour in range(9, 11):
        for minute in range(0, 60):
            if hour == 9 and minute < 30:
                continue
            if hour == 11 and minute >= 30:
                break
            
            # 随机价格波动
            currentPrice += (random.random() - 0.5) * 0.5
            currentPrice = max(0, currentPrice)
            
            time_str = f"{year}-{month}-{day} {str(hour).zfill(2)}:{str(minute).zfill(2)}"
            volume = int(random.random() * 10000)
            amount = round(currentPrice * volume, 3)
            
            trends.append(f"{time_str},{round(currentPrice, 3)},{volume},{amount}")
    
    # 生成13:00-15:00的数据
    for hour in range(13, 15):
        for minute in range(0, 60):
            # 随机价格波动
            currentPrice += (random.random() - 0.5) * 0.5
            currentPrice = max(0, currentPrice)
            
            time_str = f"{year}-{month}-{day} {str(hour).zfill(2)}:{str(minute).zfill(2)}"
            volume = int(random.random() * 10000)
            amount = round(currentPrice * volume, 3)
            
            trends.append(f"{time_str},{round(currentPrice, 3)},{volume},{amount}")
    
    return {
        'rc': 0,
        'data': {
            'code': code,
            'preClose': preClose,
            'trends': trends
        }
    }

@app.route('/api/profit-ratio-data')
def get_profit_ratio_data_api():
    """
    获取指定股票的获利比例历史数据API
    """
    try:
        # 获取请求参数，同时支持stock_code和code参数，增强兼容性
        stock_code = request.args.get('stock_code', request.args.get('code', '301629'))
        days = int(request.args.get('days', 120))
        
        # 添加日志记录
        print(f"接收到API请求: stock_code={stock_code}, days={days}")
        
        # 导入huoli模块的函数
        import huoli
        
        # 获取获利比例数据
        data = huoli.get_profit_ratio_data(stock_code=stock_code, days=days)
        
        # 添加日志记录数据量
        print(f"获取到数据量: {len(data)}条")
        
        # 返回JSON数据
        return jsonify({
            'status': 'success',
            'data': data
        })
        
    except Exception as e:
        # 详细记录错误信息
        print(f"API错误: {str(e)}")
        # 错误处理
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

def scheduled_crawl():
    """定时执行股票数据抓取"""
    logging.info("定时任务开始执行: 抓取股票数据")
    # 强制更新今天的数据，不绕过时间检查（保持原有定时任务逻辑）
    crawler.crawl_stock_data(crawl_today_only=True, force_update=True)
    logging.info("定时任务执行完成: 股票数据抓取已完成")

@app.route('/api/crawl')
def api_crawl_stock_data():
    """API端点：抓取股票数据
    用于Vercel Cron Jobs或其他外部服务调用
    """
    logging.info("API请求开始执行: 抓取股票数据")
    result = crawler.crawl_stock_data(crawl_today_only=True, force_update=True, bypass_time_check=True)
    logging.info("API请求执行完成: 股票数据抓取已完成")
    return jsonify(result)

# 初始化定时任务调度器（仅在本地开发环境使用）
# Vercel环境下使用Cron Jobs替代
try:
    if os.environ.get('VERCEL_ENV') is None:  # 仅在本地环境启动
        scheduler = BackgroundScheduler(timezone='Asia/Shanghai')
        # 添加定时任务：周一到周五15:30执行
        scheduler.add_job(scheduled_crawl, 'cron', hour=15, minute=30, second=0, day_of_week='0-4')
        # 添加定时任务：周一到周五16:30执行
        scheduler.add_job(scheduled_crawl, 'cron', hour=16, minute=30, second=0, day_of_week='0-4')
        scheduler.start()
        logging.info("定时任务调度器已启动（本地开发环境）")
    else:
        logging.info("Vercel环境下跳过定时任务调度器启动")
except Exception as e:
    logging.error(f"启动定时任务调度器失败: {e}")

@app.route('/api/proxy-eastmoney-stock-data')
def proxy_eastmoney_stock_data():
    """代理东方财富网股票数据API，解决跨域问题"""
    try:
        # 获取查询参数
        secids = request.args.get('secids')
        
        if not secids:
            return jsonify({'error': '缺少必要参数'}), 400
            
        # 日志记录请求的股票ID
        logging.info(f"请求的股票ID: {secids}")
        
        # 设置请求头，模拟浏览器行为
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            'Referer': 'https://data.eastmoney.com/',
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
        
        # 使用用户指定的API URL
        api_url = f"https://push2.eastmoney.com/api/qt/ulist.np/get"
        api_url += f"?fields=f2,f3,f6,f12,f14"  # 添加f6字段以获取成交额
        api_url += f"&fltt=2"
        api_url += f"&secids={secids}"
        
        logging.info(f"构建的API URL: {api_url}")
        
        # 请求重试机制
        max_retries = 3
        retry_count = 0
        success = False
        response_data = None
        
        while retry_count < max_retries and not success:
            try:
                # 发送请求
                response = requests.get(api_url, headers=headers, timeout=10)
                response.raise_for_status()
                
                # 处理响应
                response_data = response.json()
                
                # 日志记录返回数据
                logging.info(f"API返回数据: {response_data}")
                
                # 验证数据格式
                if response_data and 'rc' in response_data and response_data['rc'] == 0 and 'data' in response_data:
                    success = True
                    logging.info(f"成功获取股票数据，共 {len(response_data['data'].get('diff', []))} 条")
                else:
                    logging.warning(f"返回数据格式不正确或请求失败: {response_data}")
                    retry_count += 1
                    time.sleep(1)
                    
            except requests.RequestException as e:
                logging.warning(f"请求失败 (尝试 {retry_count+1}/{max_retries}): {str(e)}")
                retry_count += 1
                time.sleep(1)
        
        # 准备响应
        if success and response_data:
            # 创建响应对象，设置CORS头
            response = make_response(jsonify(response_data))
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response.headers['Access-Control-Max-Age'] = '30'
            return response
        else:
            # 失败时返回错误响应
            return jsonify({'error': '获取数据失败，请稍后重试'}), 503
            
    except Exception as e:
        logging.error(f"处理请求时发生错误: {str(e)}")
        return jsonify({'error': '服务器内部错误'}), 500
        
@app.route('/api/proxy-eastmoney-kline-data', methods=['GET'])
def proxy_eastmoney_kline_data():
    """代理东方财富网K线图数据API，解决跨域问题"""
    try:
        # 获取查询参数
        secid = request.args.get('secid')
        klt = request.args.get('klt', '101')  # 默认日线
        fqt = request.args.get('fqt', '1')    # 默认前复权
        lmt = request.args.get('lmt', '250')  # 默认250条数据
        end = request.args.get('end')         # 结束日期
        
        if not secid or not end:
            return jsonify({'error': '缺少必要参数'}), 400
            
        # 构建东方财富网API URL
        api_url = f"https://push2his.eastmoney.com/api/qt/stock/kline/get?"
        api_url += f"secid={secid}&klt={klt}&fqt={fqt}&lmt={lmt}&end={end}"
        api_url += "&iscca=1&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62"
        api_url += "&ut=f057cbcbce2a86e2866ab8877db1d059&forcect=1"
        
        # 设置请求头，模拟浏览器行为
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
            'Referer': 'https://data.eastmoney.com/',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
        }
        
        # 发送请求到东方财富网API
        response = requests.get(api_url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # 获取返回的数据
        data = response.json()
        
        # 设置CORS响应头
        response_headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Cache-Control': 'max-age=300'  # 5分钟缓存
        }
        
        return jsonify(data), 200, response_headers
        
    except requests.RequestException as e:
        # API请求失败，返回模拟数据作为后备
        print(f"东方财富网K线API请求失败: {str(e)}")
        mock_data = generate_mock_kline_data(secid)
        return jsonify(mock_data), 200, {'Access-Control-Allow-Origin': '*'}
    except Exception as e:
        print(f"代理K线数据处理异常: {str(e)}")
        return jsonify({'error': '服务器内部错误'}), 500

# ==================== 股票跟踪功能相关路由 ====================

@app.route('/followadmin')
def follow_admin():
    """股票跟踪后台管理页面"""
    return render_template('followadmin.html')

@app.route('/follow')
def follow():
    """股票跟踪前台展示页面"""
    return render_template('follow.html')

@app.route('/api/follow/tabs')
def api_follow_tabs():
    """获取所有跟踪分类"""
    try:
        tabs = db.get_follow_tabs()
        return jsonify({'status': 'success', 'data': tabs})
    except Exception as e:
        logging.error(f"获取跟踪分类失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/tabs', methods=['POST'])
def api_create_follow_tab():
    """创建跟踪分类"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        
        if not name:
            return jsonify({'status': 'error', 'message': '分类名称不能为空'}), 400
        
        # 获取当前最大排序值
        tabs = db.get_follow_tabs()
        max_sort = max([tab.get('sort_order', 0) for tab in tabs]) if tabs else 0
        
        tab_id = db.create_follow_tab(name, max_sort + 1)
        
        if tab_id:
            return jsonify({'status': 'success', 'data': {'id': tab_id, 'name': name}})
        else:
            return jsonify({'status': 'error', 'message': '创建失败'}), 500
            
    except Exception as e:
        logging.error(f"创建跟踪分类失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/tabs/<int:tab_id>', methods=['PUT'])
def api_update_follow_tab(tab_id):
    """更新跟踪分类"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        
        if not name:
            return jsonify({'status': 'error', 'message': '分类名称不能为空'}), 400
        
        success = db.update_follow_tab(tab_id, name)
        
        if success:
            return jsonify({'status': 'success'})
        else:
            return jsonify({'status': 'error', 'message': '更新失败'}), 500
            
    except Exception as e:
        logging.error(f"更新跟踪分类失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/tabs/<int:tab_id>', methods=['DELETE'])
def api_delete_follow_tab(tab_id):
    """删除跟踪分类"""
    try:
        success = db.delete_follow_tab(tab_id)
        
        if success:
            return jsonify({'status': 'success'})
        else:
            return jsonify({'status': 'error', 'message': '删除失败'}), 500
            
    except Exception as e:
        logging.error(f"删除跟踪分类失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/stocks/<int:tab_id>')
def api_follow_stocks(tab_id):
    """获取指定分类下的所有股票"""
    try:
        stocks = db.get_follow_stocks(tab_id)
        return jsonify({'status': 'success', 'data': stocks})
    except Exception as e:
        logging.error(f"获取跟踪股票失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/stocks', methods=['POST'])
def api_create_follow_stock():
    """创建跟踪股票"""
    try:
        data = request.json
        tab_id = data.get('tab_id')
        plate = data.get('plate', '').strip()
        name = data.get('name', '').strip()
        code = data.get('code', '').strip()
        
        if not tab_id or not name or not code:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 验证代码格式（6位数字）
        if not code.isdigit() or len(code) != 6:
            return jsonify({'status': 'error', 'message': '股票代码必须是6位数字'}), 400
        
        stock_id = db.create_follow_stock(tab_id, plate, name, code)
        
        if stock_id:
            return jsonify({'status': 'success', 'data': {'id': stock_id}})
        else:
            return jsonify({'status': 'error', 'message': '创建失败'}), 500
            
    except Exception as e:
        logging.error(f"创建跟踪股票失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/stocks/<int:stock_id>', methods=['PUT'])
def api_update_follow_stock(stock_id):
    """更新跟踪股票"""
    try:
        data = request.json
        plate = data.get('plate', '').strip()
        name = data.get('name', '').strip()
        code = data.get('code', '').strip()
        
        if not name or not code:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 验证代码格式（6位数字）
        if not code.isdigit() or len(code) != 6:
            return jsonify({'status': 'error', 'message': '股票代码必须是6位数字'}), 400
        
        success = db.update_follow_stock(stock_id, plate, name, code)
        
        if success:
            return jsonify({'status': 'success'})
        else:
            return jsonify({'status': 'error', 'message': '更新失败'}), 500
            
    except Exception as e:
        logging.error(f"更新跟踪股票失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/stocks/<int:stock_id>', methods=['DELETE'])
def api_delete_follow_stock(stock_id):
    """删除跟踪股票"""
    try:
        success = db.delete_follow_stock(stock_id)
        
        if success:
            return jsonify({'status': 'success'})
        else:
            return jsonify({'status': 'error', 'message': '删除失败'}), 500
            
    except Exception as e:
        logging.error(f"删除跟踪股票失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/stocks/reorder', methods=['POST'])
def api_reorder_follow_stocks():
    """保存股票行顺序"""
    try:
        data = request.json
        tab_id = data.get('tab_id')
        orders = data.get('orders', [])
        
        if not tab_id or not orders:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        success = db.update_follow_stock_orders(orders)
        
        if success:
            return jsonify({'status': 'success'})
        else:
            return jsonify({'status': 'error', 'message': '保存顺序失败'}), 500
            
    except Exception as e:
        logging.error(f"保存股票顺序失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/stocks/all')
def api_all_follow_stocks():
    """获取所有跟踪股票"""
    try:
        stocks = db.get_all_follow_stocks()
        return jsonify({'status': 'success', 'data': stocks})
    except Exception as e:
        logging.error(f"获取所有跟踪股票失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/realtime-prices')
def api_follow_realtime_prices():
    """获取跟踪股票的实时价格"""
    try:
        # 获取所有跟踪股票
        stocks = db.get_all_follow_stocks()
        
        if not stocks:
            return jsonify({'status': 'success', 'data': []})
        
        # 构建secids参数
        secids = []
        for stock in stocks:
            code = stock['code']
            # 根据代码开头判断市场
            if code[0] == '6':
                market = '1'  # 沪市
            else:
                market = '0'  # 深市
            secids.append(f"{market}.{code}")
        
        secids_str = ','.join(secids)
        
        # 构建API URL
        api_url = f"https://push2.eastmoney.com/api/qt/ulist.np/get"
        api_url += f"?fields=f2,f3,f6,f12,f14"
        api_url += f"&fltt=2"
        api_url += f"&secids={secids_str}"
        
        # 设置请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://data.eastmoney.com/',
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
        
        # 发送请求
        response = requests.get(api_url, headers=headers, timeout=10)
        response.raise_for_status()
        
        result = response.json()
        
        # 解析返回的数据并更新数据库
        if result and 'data' in result and 'diff' in result['data']:
            stock_updates = []
            
            for item in result['data']['diff']:
                code = str(item.get('f12', ''))
                price = item.get('f2', 0)
                change_percent = item.get('f3', 0)
                
                if code:
                    stock_updates.append({
                        'code': code,
                        'price': price,
                        'change_percent': change_percent
                    })
            
            # 批量更新数据库
            if stock_updates:
                db.update_follow_stock_prices(stock_updates)
            
            return jsonify({'status': 'success', 'data': result['data']['diff']})
        else:
            return jsonify({'status': 'success', 'data': []})
            
    except Exception as e:
        logging.error(f"获取实时价格失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/follow/search-code')
def api_search_stock_code():
    """根据股票名称搜索股票代码"""
    try:
        name = request.args.get('name', '').strip()
        
        if not name:
            return jsonify({'status': 'error', 'message': '股票名称不能为空'}), 400
        
        code = db.get_stock_code_by_name(name)
        
        if code:
            return jsonify({'status': 'success', 'data': {'code': code}})
        else:
            return jsonify({'status': 'error', 'message': '未找到匹配的股票'}), 404
            
    except Exception as e:
        logging.error(f"搜索股票代码失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

def generate_mock_kline_data(secid):
    """生成模拟的K线图数据"""
    # 生成日期
    dates = []
    klines = []
    today = datetime.now()
    
    # 初始价格在100左右
    base_price = 100
    
    for i in range(250):
        # 生成日期字符串
        date = today - timedelta(days=249-i)
        date_str = date.strftime('%Y%m%d')
        dates.append(date_str)
        
        # 随机波动价格
        change = (random.random() - 0.5) * 5
        base_price += change
        base_price = max(50, base_price)
        
        # 生成当日K线数据
        open_price = base_price
        close_price = base_price + (random.random() - 0.5) * 2
        high_price = max(open_price, close_price) + random.random() * 2
        low_price = min(open_price, close_price) - random.random() * 2
        volume = int(10000000 + random.random() * 90000000)
        amount = volume * close_price
        
        # 格式化为东方财富网API返回的字符串格式
        kline_str = f"{date_str},{open_price:.2f},{close_price:.2f},{high_price:.2f},{low_price:.2f},{volume},{amount:.2f},0,0,0,0,0"
        klines.append(kline_str)
    
    return {
        'rc': [0, 0],
        'rt': 1,
        'svr': 1,
        'lt': 1,
        'full': 1,
        'data': {
            'code': secid.split('.')[-1],
            'market': 'sh' if secid.startswith('1') else 'sz',
            'name': '模拟股票',
            'klines': klines
        }
    }
# 确保在Vercel环境中也能正常运行
# 初始化数据库
print("Initializing database...")
try:
    db.init_db()
    db.init_follow_tables()  # 初始化股票跟踪相关表
    print("Database initialized successfully")
except Exception as e:
    print(f"Database initialization failed: {e}")
    import traceback
    traceback.print_exc()

if __name__ == '__main__':
    print("Starting app.py...")
    # 确保templates目录存在
    if not os.path.exists('templates'):
        print("Creating templates directory...")
        os.makedirs('templates')
    # 启动Flask应用
    print("Starting Flask app...")
    print("App will be available at http://127.0.0.1:5000/")
    try:
        # 本地开发时使用debug模式
        app.run(debug=True, host='0.0.0.0', port=15000)
    except Exception as e:
        print(f"Flask app failed to start: {e}")
        import traceback
        traceback.print_exc()

