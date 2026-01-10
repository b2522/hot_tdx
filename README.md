# 股票涨停板分析系统

## 项目简介

股票涨停板分析系统是一个基于Flask框架开发的股票数据抓取、存储和分析平台。该系统主要用于抓取股票涨停板数据，并提供数据查询、分析和可视化功能，帮助用户更好地了解股票市场的涨停板行情。

## 功能特点

### 数据抓取功能
- 定时从股票数据API抓取涨停板数据
- 支持按日期抓取单天或历史数据
- 数据去重和更新机制
- 抓取时间限制（避免在交易时间干扰）

### 数据管理功能
- SQLite数据库存储股票数据
- 按日期分表存储，优化查询性能
- 自动创建索引，提升搜索速度
- 支持数据的增删改查操作

### 搜索与筛选功能
- 股票名称关键词搜索
- 拼音和拼音首字母搜索支持
- 题材板块筛选
- 日期筛选功能

### 数据可视化功能
- 股票涨幅排序
- 几天几板统计排序
- 股票K线图展示
- 分时图数据展示
- 获利比例历史数据

### 系统功能
- 支持定时任务调度（本地开发环境）
- Vercel部署支持
- 跨域请求处理
- API请求重试机制
- 错误日志记录

## 技术栈

### 后端技术
- **Flask**: Python Web框架，用于构建API和Web界面
- **SQLite**: 轻量级关系型数据库，用于存储股票数据
- **Requests**: HTTP库，用于抓取股票数据
- **APScheduler**: 定时任务调度库（本地开发环境）
- **Pypinyin**: 中文拼音转换库，支持拼音搜索

### 前端技术
- **HTML/CSS**: 构建用户界面
- **JavaScript**: 前端交互逻辑
- **Chart.js**: 图表可视化库

### 部署技术
- **Vercel**: 云平台部署（生产环境）
- **GitHub Actions**: CI/CD自动化流程

## 项目结构

```
xuangutong_web/
├── .github/workflows/        # GitHub Actions工作流配置
│   └── crawl-stock-data.yml  # 股票数据抓取定时任务
├── __pycache__/              # Python编译缓存
├── static/                   # 静态资源目录
│   ├── css/                  # CSS样式文件
│   │   └── styles.css
│   ├── js/                   # JavaScript文件
│   │   └── klinechart.js
│   └── filter_plate_function.js
├── templates/                # HTML模板文件
│   ├── index.html            # 主页面
│   ├── stock_detail.html     # 股票详情页
│   └── filter_plate_function.js
├── app.py                    # Flask应用主入口
├── crawler.py                # 股票数据抓取模块
├── db.py                     # 数据库操作模块
├── huoli.py                  # 获利比例数据模块
├── plate_search.py           # 题材搜索模块
├── requirements.txt          # Python依赖包列表
├── stock_data.db             # SQLite数据库文件
├── vercel.json               # Vercel部署配置
└── wsgi.py                   # WSGI服务器入口
```

## 安装和运行

### 本地开发环境

1. 克隆项目到本地：
```bash
git clone <项目仓库地址>
cd xuangutong_web
```

2. 安装依赖包：
```bash
pip install -r requirements.txt
```

3. 启动Flask应用：
```bash
set FLASK_APP=app.py
flask run
```

4. 访问应用：
```
http://127.0.0.1:5000/
```

### Vercel部署

1. 将项目推送到GitHub仓库
2. 在Vercel上导入GitHub仓库
3. 配置Vercel环境变量
4. 部署应用

## 主要功能模块

### 1. 数据抓取模块 (crawler.py)

**核心功能**：从股票API抓取涨停板数据

**主要函数**：
- `crawl_stock_data()`: 抓取股票数据的主函数
- `process_and_store_data()`: 处理并存储股票数据
- `is_valid_crawl_time()`: 检查是否在允许的抓取时间范围内

**抓取逻辑**：
- 仅在非交易时间抓取数据（15:00-9:00）
- 支持单天或历史数据抓取
- 自动去重和数据更新

### 2. 数据库模块 (db.py)

**核心功能**：管理股票数据的存储和查询

**主要函数**：
- `init_db()`: 初始化数据库
- `create_table()`: 创建股票数据表
- `store_stock_data()`: 存储股票数据
- `get_stock_data_by_date()`: 根据日期获取股票数据
- `search_stocks_by_keyword()`: 关键词搜索股票
- `search_stocks_by_plate()`: 根据题材搜索股票

**数据库结构**：
- 按日期分表存储（stock_YYYYMMDD）
- 支持股票代码、名称、描述、题材、几天几板等字段

### 3. Web应用模块 (app.py)

**核心功能**：提供Web界面和API接口

**主要路由**：
- `/`: 首页，展示股票数据
- `/search`: 搜索股票名称
- `/search-results`: 搜索结果页面
- `/stock/<stock_code>`: 股票详情页
- `/api/xxx`: 各种API接口

**API接口**：
- `/api/realtime-stock-data`: 获取实时股票数据
- `/api/time-sharing-data`: 获取分时图数据
- `/api/profit-ratio-data`: 获取获利比例数据
- `/api/proxy-eastmoney-stock-data`: 代理东方财富网股票数据

### 4. 获利比例模块 (huoli.py)

**核心功能**：获取股票获利比例历史数据

**主要函数**：
- `get_profit_ratio_data()`: 获取指定股票的获利比例数据

## API接口说明

### 1. 搜索API

**接口URL**: `/search?keyword=关键词`
**请求方法**: GET
**功能**: 搜索股票名称，支持中文、拼音和拼音首字母
**返回格式**: JSON数组，包含匹配的股票名称

### 2. 日期数据API

**接口URL**: `/get-data-by-date?date=YYYYMMDD`
**请求方法**: GET
**功能**: 获取指定日期的股票数据
**返回格式**: JSON数组，包含股票数据

### 3. 可用日期API

**接口URL**: `/available-dates`
**请求方法**: GET
**功能**: 获取所有有数据的日期
**返回格式**: JSON数组，包含日期字符串

### 4. 实时股票数据API

**接口URL**: `/api/realtime-stock-data?symbols=股票代码列表`
**请求方法**: GET
**功能**: 获取实时股票数据
**返回格式**: JSON对象，包含实时股票数据

### 5. 分时图数据API

**接口URL**: `/api/time-sharing-data?code=股票代码`
**请求方法**: GET
**功能**: 获取股票分时图数据
**返回格式**: JSON对象，包含分时图数据

### 6. 获利比例数据API

**接口URL**: `/api/profit-ratio-data?stock_code=股票代码&days=天数`
**请求方法**: GET
**功能**: 获取股票获利比例历史数据
**返回格式**: JSON对象，包含获利比例数据

## 定时任务

### 本地开发环境

使用APScheduler实现定时任务：
- 每周一至周五15:10执行数据抓取
- 每周一至周五16:15执行数据抓取

### Vercel环境

使用GitHub Actions实现定时任务：
- 北京时间15:05（UTC时间7:05）执行数据抓取

## 使用方法

### 1. 查看股票数据

- 访问首页，默认显示最新一天的股票数据
- 使用日期选择器切换不同日期的数据

### 2. 搜索股票

- 在搜索框中输入股票名称、拼音或拼音首字母
- 点击搜索按钮或按下回车键
- 查看搜索结果

### 3. 筛选股票

- 使用题材筛选功能，输入题材名称
- 查看符合条件的股票

### 4. 排序股票

- 点击表头"涨幅"或"几天几板"进行排序
- 支持升序和降序切换

### 5. 查看股票详情

- 点击股票代码，进入股票详情页
- 查看股票K线图、分时图和获利比例数据

## 注意事项

### 数据抓取限制

- 系统仅在非交易时间（15:00-9:00）抓取数据
- 避免频繁抓取，防止被API提供商限制

### 数据准确性

- 股票数据来源于第三方API，仅供参考
- 系统不保证数据的100%准确性

### 搜索功能

- 支持中文、拼音和拼音首字母搜索
- 搜索结果可能存在延迟

### 部署环境

- 本地开发环境使用Flask内置服务器
- 生产环境建议使用WSGI服务器
- Vercel部署需配置正确的环境变量

## 许可证

MIT License

## 作者

- 开发者: [作者姓名]
- GitHub: [GitHub地址]
- 邮箱: [邮箱地址]

## 更新日志

### v1.0.0 (2025-12-01)
- 初始版本发布
- 实现股票数据抓取功能
- 实现搜索和筛选功能
- 实现数据可视化功能

### v1.1.0 (2025-12-15)
- 优化数据抓取逻辑
- 增加拼音搜索支持
- 改进用户界面
- 修复已知bug

### v1.2.0 (2025-12-30)
- 增加获利比例数据功能
- 支持Vercel部署
- 增加API代理功能
- 优化性能和稳定性

---

感谢使用股票涨停板分析系统！如果您有任何问题或建议，欢迎提出反馈。