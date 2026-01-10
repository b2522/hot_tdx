// 搜索建议功能，从后端API获取数据
function showSuggestions(inputValue) {
    var suggestionsContainer = document.getElementById('searchSuggestions');
    var searchInput = document.getElementById('searchInput');
    
    if (!suggestionsContainer || !searchInput) {
        return;
    }
    
    // 动态定位搜索建议下拉框
    var inputRect = searchInput.getBoundingClientRect();
    var containerRect = document.querySelector('.table-container');
    
    if (!containerRect) {
        return;
    }
    
    containerRect = containerRect.getBoundingClientRect();
    
    suggestionsContainer.style.top = (inputRect.bottom - containerRect.top) + 'px';
    suggestionsContainer.style.left = (inputRect.left - containerRect.left) + 'px';
    suggestionsContainer.style.width = inputRect.width + 'px';
    
    if (inputValue === '') {
        suggestionsContainer.style.display = 'none';
        return;
    }
    
    // 发送AJAX请求到后端API
    fetch('/search?keyword=' + encodeURIComponent(inputValue))
        .then(function(response) { return response.json(); })
        .then(function(filteredNames) {
            console.log('后端返回的搜索结果数量:', filteredNames.length);
            console.log('搜索结果:', filteredNames);
            
            if (filteredNames.length === 0) {
                suggestionsContainer.style.display = 'none';
                return;
            }
            
            suggestionsContainer.innerHTML = '';
            Array.prototype.forEach.call(filteredNames, function(name) {
                var div = document.createElement('div');
                div.className = 'search-suggestion-item';
                div.textContent = name;
                div.onclick = function() {
                    document.getElementById('searchInput').value = name;
                    suggestionsContainer.style.display = 'none';
                    // 跳转到搜索结果页面
                    window.location.href = '/search-results?keyword=' + encodeURIComponent(name);
                };
                suggestionsContainer.appendChild(div);
            });
            
            suggestionsContainer.style.display = 'block';
        })
        .catch(function(error) {
            console.error('获取搜索建议失败:', error);
            suggestionsContainer.style.display = 'none';
        });
}

// 日期过滤功能
function filterByDate(dateValue) {
    if (!dateValue) {
        // 如果没有选择日期，重新加载页面显示最新数据
        window.location.href = '/';
        return;
    }
    
    // 统一日期格式：将YYYY-MM-DD转换为YYYYMMDD
    var normalizedDate = dateValue.replace(/-/g, '');
    
    // 发送AJAX请求获取指定日期的数据
    fetch('/get-data-by-date?date=' + encodeURIComponent(normalizedDate))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            var tbody = document.getElementById('stockTableBody');
            tbody.innerHTML = '';
            
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="no-data">该日期暂无数据</td></tr>';
                return;
            }
            
            // 渲染数据
            Array.prototype.forEach.call(data, function(stock) {
                    var row = document.createElement('tr');
                    var link = 'https://xuangutong.com.cn/stock/' + stock.code_part + '.' + stock.market.toUpperCase();
                    var codeClass = stock.code_part.startsWith('3') ? 'orange-code' : '';
                    var nameClass = stock.code_part.startsWith('688') ? 'stock-name-link blue-text' : (stock.code_part.startsWith('3') || stock.code_part.startsWith('68')) ? 'stock-name-link orange-text' : 'stock-name-link';
                    row.innerHTML = 
                        '<td><a href="' + link + '" target="_blank" class="' + nameClass + '">' + stock.name + '</a></td>' +
                        '<td><div class="time-chart" data-code="' + stock.code_part + '"></div></td>' +
                        '<td class="price"></td>' +
                        '<td class="change-percentage"></td>' +
                        '<td class="amount"></td>' +
                        '<td class="value"></td>' +
                        '<td style="display: none;" class="' + codeClass + '">' + stock.code_part + '</td>' +
                        '<td style="display: none;">' + stock.market + '</td>' +
                        '<td>' + (stock.m_days_n_boards ? '<span class="days-boards-tag">' + stock.m_days_n_boards + '</span>' : stock.m_days_n_boards) + '</td>' +
                        '<td>' + (stock.description ? stock.description.substring(0, 100) + (stock.description.length > 100 ? '...' : '') : '') + '</td>' +
                        '<td class="plate-column">' + stock.plates + '</td>';
                    
                    // 强制设置题材列宽度
                    var plateColumn = row.querySelector('td.plate-column');
                    if (plateColumn) {
                        plateColumn.style.width = '70px';
                        plateColumn.style.minWidth = '70px';
                        plateColumn.style.maxWidth = '70px';
                        plateColumn.style.overflow = 'hidden';
                        plateColumn.style.padding = '4px';
                        plateColumn.style.boxSizing = 'border-box';
                    }
                    tbody.appendChild(row);
                });
            
            // 渲染完历史数据后，重置分时图状态并重新渲染
            visibleStockCodes = {}; // 重置可见股票代码集合
    timeChartInstances = {}; // 重置图表实例
            setTimeout(function() {
                renderVisibleCharts(); // 重新渲染可见区域内的分时图
                fetchRealTimeStockData(); // 获取实时股票数据
                // 更新题材统计
                updatePlateStats();
                // 重新绑定K线图事件
                if (typeof initStockNameEvents === 'function') {
                    initStockNameEvents();
                }
                // 强制设置题材列宽度
                forcePlateColumnWidth();
            }, 100);
        })
        .catch(function(error) {
            console.error('获取指定日期数据失败:', error);
        });
}

// 重置过滤条件
function resetFilters() {
    var searchInput = document.getElementById('searchInput');
    var dateFilter = document.getElementById('dateFilter');
    var searchSuggestions = document.getElementById('searchSuggestions');
    
    if (searchInput) {
        searchInput.value = '';
    }
    
    if (dateFilter) {
        dateFilter.value = '';
    }
    
    if (searchSuggestions) {
        searchSuggestions.style.display = 'none';
    }
    
    // 重新加载页面显示最新数据
    window.location.href = '/';
}

// 清除搜索
function clearSearch() {
    var searchInput = document.getElementById('searchInput');
    var searchSuggestions = document.getElementById('searchSuggestions');
    
    if (searchInput) {
        searchInput.value = '';
    }
    
    if (searchSuggestions) {
        searchSuggestions.style.display = 'none';
    }
    
    // 显示所有行
    var rows = document.querySelectorAll('#stockTableBody tr');
    rows.forEach(function(row) {
        row.style.display = '';
    });
}



// 强制设置题材列宽度
function forcePlateColumnWidth() {
    // 获取所有题材列的表头和单元格
    var plateColumns = document.querySelectorAll('.plate-column, th:nth-child(11), td:nth-child(11), th:last-child, td:last-child');
    
    plateColumns.forEach(function(column) {
        // 强制设置宽度
        column.style.width = '70px';
        column.style.minWidth = '70px';
        column.style.maxWidth = '70px';
        column.style.overflow = 'hidden';
        column.style.padding = '4px';
        column.style.boxSizing = 'border-box';
    });
    
    // 特别处理搜索框
    var plateInput = document.querySelector('.plate-column .filter-input, th:nth-child(11) .filter-input');
    if (plateInput) {
        plateInput.style.width = '100%';
        plateInput.style.maxWidth = '60px';
        plateInput.style.fontSize = '11px';
        plateInput.style.padding = '2px';
    }
}

// 页面加载完成后设置题材列宽度
window.addEventListener('load', function() {
    forcePlateColumnWidth();
    
    // 定时检查并强制设置宽度，确保在数据加载后也能生效
    setTimeout(forcePlateColumnWidth, 1000);
    setTimeout(forcePlateColumnWidth, 3000);
});

// 控制定时刷新的函数
function controlRefreshTimer() {
    // 清除之前的定时器
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    
    // 检查是否在交易时间内
    if (isInTradingHours()) {
        // 在交易时间内，启动定时刷新
        console.log('当前处于交易时间，启动定时刷新');
        // 立即执行一次刷新
        fetchRealTimeStockData();
        // 设置定时器，每60秒执行一次
        refreshTimer = setInterval(function() {
            if (isInTradingHours()) {
                fetchRealTimeStockData();
            } else {
                // 如果不在交易时间内，停止定时器
                console.log('当前已超出交易时间，停止定时刷新');
                clearInterval(refreshTimer);
                refreshTimer = null;
            }
        }, REFRESH_INTERVAL);
    } else {
        console.log('当前不在交易时间内，不启动定时刷新');
    }
}

// 节流函数，限制函数调用频率
function throttle(func, delay) {
    var lastCall = 0;
    return function() {
        var now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            return func.apply(this, arguments);
        }
    };
}

// 防抖函数，确保函数只在停止触发一段时间后才执行
function debounce(func, delay) {
    var timeoutId;
    return function() {
        var context = this;
        var args = arguments;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(function() {
            func.apply(context, args);
        }, delay);
    };
}

// 全局初始化 - 合并所有DOMContentLoaded事件处理逻辑
document.addEventListener('DOMContentLoaded', function() {
    // 处理日期选择器和可用日期加载
    var dateInput = document.getElementById('dateFilter');
    if (dateInput) {
        // 设置最小和最大日期
        var minDate = '2025-12-01';
        var today = new Date().toISOString().split('T')[0];
        dateInput.min = minDate;
        dateInput.max = today;

        // 加载可用日期
        fetch('/available-dates')
            .then(function(response) { return response.json(); })
            .then(function(dates) {
                // 存储可用日期
                window.availableDates = dates;

                // 验证选择的日期是否有数据且不是周末
                dateInput.addEventListener('input', debounce(function(e) {
                    if (this.value) {
                        var selectedDate = this.value.replace(/-/g, '');
                        var dateObj = new Date(this.value);
                        var dayOfWeek = dateObj.getDay(); // 0=周日, 1=周一, ..., 6=周六
                        
                        // 检查是否是周末
                        if (dayOfWeek === 0 || dayOfWeek === 6) {
                            console.log('选择了周末日期:', selectedDate);
                            alert('周六、周日不可选择');
                            this.value = '';
                            return;
                        }
                        
                        // 直接调用API检查日期是否有数据，而仅依赖缓存列表
                        console.log('检查日期是否有数据:', selectedDate);
                        fetch('/get-data-by-date?date=' + encodeURIComponent(selectedDate))
                            .then(function(response) {
                                return response.json();
                            })
                            .then(function(data) {
                                // 如果返回的数据为空数组，说明该日期没有数据
                                if (!data || data.length === 0) {
                                    console.log('日期无数据:', selectedDate, data);
                                    alert('该日期无数据');
                                    e.target.value = '';
                                } else {
                                    console.log('日期有数据:', selectedDate, '数据条数:', data.length);
                                }
                            })
                            .catch(function(error) {
                                console.error('检查日期数据失败:', error);
                            });
                    }
                }, 300));
            })
            .catch(function(error) {
                console.error('获取可用日期失败:', error);
            });
    }
    
    // 分时图初始化
    // 初始渲染可视区域内的图表
    renderVisibleCharts();
    
    // 添加节流处理的滚动事件监听
    window.addEventListener('scroll', throttle(function() {
        renderVisibleCharts();
    }, 100));
    
    // 添加节流处理的窗口大小变化监听
    window.addEventListener('resize', throttle(function() {
        renderVisibleCharts();
    }, 100));
    
    // 启动定时刷新控制
    controlRefreshTimer();
    
    // 启动分时图定时刷新控制
    controlTimeChartRefreshTimer();
    
    // 每5分钟检查一次交易时间状态，确保在交易时间开始时自动启动刷新
    setInterval(controlRefreshTimer, 5 * 60 * 1000);
    setInterval(controlTimeChartRefreshTimer, 5 * 60 * 1000);
    
    // 页面加载完成后自动获取和显示实时股票数据
    fetchRealTimeStockData();
    
    // 搜索输入框回车事件
    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                var searchTerm = this.value.trim();
                if (searchTerm) {
                    window.location.href = '/search-results?keyword=' + encodeURIComponent(searchTerm);
                }
            }
        });
    }
    
    // 点击页面其他地方关闭搜索提示
    document.addEventListener('click', function(e) {
        var searchContainer = document.querySelector('.search-container');
        if (searchContainer && !searchContainer.contains(e.target)) {
            var searchSuggestions = document.getElementById('searchSuggestions');
            if (searchSuggestions) {
                searchSuggestions.style.display = 'none';
            }
        }
    });
});
// 刷新状态控制变量
var refreshTimer = null;
var isRefreshing = false;
var retryCount = 0;
var MAX_RETRIES = 3;
var REFRESH_INTERVAL = 60000; // 60秒

// 分时图相关变量
var timeChartInstances = {}; // 存储图表实例，使用对象替代Map
var visibleStockCodes = {}; // 存储可见的股票代码，使用对象替代Set

// 数据缓存对象
var dataCache = {
    timeSharingData: {},
    realTimeData: {},
    cacheDuration: 30000 // 缓存30秒
};

// 并发请求控制
var MAX_CONCURRENT_REQUESTS = 5;
var activeRequests = 0;
var requestQueue = [];

// 根据股票代码获取分时数据的API调用函数，使用缓存
function fetchTimeSharingData(stockCode) {
    // 检查缓存
    var cachedData = dataCache.timeSharingData[stockCode];
    var now = Date.now();
    
    if (cachedData && (now - cachedData.timestamp < dataCache.cacheDuration)) {
        return Promise.resolve(cachedData.data);
    }
    
    // 使用后端代理API避免CORS问题
    var proxyUrl = '/api/time-sharing-data?code=' + encodeURIComponent(stockCode);
    
    // 返回Promise对象
    return fetch(proxyUrl)
        .then(function(response) {
            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }
            // 解析JSON响应
            return response.json();
        })
        .then(function(data) {
            // 更新缓存
            dataCache.timeSharingData[stockCode] = {
                data: data,
                timestamp: now
            };
            return data;
        })
        .catch(function(error) {
            console.error(`获取股票 ${stockCode} 的分时数据失败:`, error);
            return null;
        });
}

// 根据股票代码生成secid参数
function generateSecid(stockCode) {
    if (!stockCode || !stockCode.length) {
        return null;
    }
    
    // 根据股票代码前缀确定市场
    var prefix = stockCode[0];
    var market;
    
    if (prefix === '6') {
        market = '1'; // 沪市
    } else if (prefix === '0' || prefix === '3') {
        market = '0'; // 深市
    } else {
        console.error(`不支持的股票代码前缀: ${prefix}`);
        return null;
    }
    
    // 格式为：market.stockCode
    return market + '.' + stockCode;
}

// 解析分时数据的函数
function parseTimeSharingData(data) {
    if (!data || data.rc !== 0 || !data.data) {
        return null;
    }
    
    var preClose = data.data.preClose;
    var trends = data.data.trends;
    
    if (!preClose || !Array.isArray(trends)) {
        return null;
    }
    
    // 解析trends数组
    var parsedData = {
        preClose: parseFloat(preClose),
        dataPoints: []
    };
    
    trends.forEach(function(trendItem) {
        var parts = trendItem.split(',');
        var time = parts[0];
        var price = parts[1];
        if (time && price) {
            // 使用更兼容的方式解析日期时间
            // 假设time格式为："2024-10-15 09:30:00"
            var dateTime = parseDateTime(time);
            parsedData.dataPoints.push({
                time: dateTime,
                price: parseFloat(price)
            });
            
            // 调试：检查13:00-13:01的数据点
            if (time.includes('13:00') || time.includes('13:01')) {
                console.log('原始数据中的13:00-13:01数据点:', time, '价格:', price);
            }
        }
    });
    
    console.log('过滤前的数据点数量:', parsedData.dataPoints.length);
    
    // 过滤数据，排除11:31~12:59的时间段
    parsedData.dataPoints = parsedData.dataPoints.filter(function(point) {
        var hours = point.time.getHours();
        var minutes = point.time.getMinutes();
        
        // 明确的过滤条件：排除11:31-12:59之间的所有时间
        var shouldFilter = (hours === 11 && minutes >= 31) || (hours === 12);
        
        // 调试：检查关键时间点
        if ((hours === 11 && minutes >= 29) || (hours === 13 && minutes <= 2)) {
            console.log('检查关键数据点:', hours + ':' + minutes, '是否被过滤:', shouldFilter);
        }
        
        return !shouldFilter;
    });
    
    console.log('过滤后的数据点数量:', parsedData.dataPoints.length);
    
    // 调试：查看过滤后的13:00-13:02数据点
    var afternoonDataPoints = parsedData.dataPoints.filter(function(point) {
        var hours = point.time.getHours();
        var minutes = point.time.getMinutes();
        return hours === 13 && minutes <= 2;
    });
    console.log('过滤后的13:00-13:02数据点:', afternoonDataPoints);
    
    // 调试：查看过滤后的最后10个数据点
    console.log('过滤后的最后10个数据点:', parsedData.dataPoints.slice(-10));
    
    // 调试：查看过滤后的前10个下午数据点
    var afternoonStartIndex = parsedData.dataPoints.findIndex(function(point) {
        var hours = point.time.getHours();
        return hours >= 13;
    });
    if (afternoonStartIndex !== -1) {
        console.log('下午数据点开始位置:', afternoonStartIndex);
        console.log('前10个下午数据点:', parsedData.dataPoints.slice(afternoonStartIndex, afternoonStartIndex + 10));
    }
    
    return parsedData;
}

// 兼容不同浏览器的日期时间解析函数
function parseDateTime(dateTimeString) {
    // 处理常见的日期时间格式
    if (!dateTimeString) {
        return new Date();
    }
    
    // 尝试直接解析（现代浏览器）
    var date = new Date(dateTimeString);
    
    // 如果解析失败，尝试手动解析
    if (isNaN(date.getTime())) {
        // 支持两种格式："YYYY-MM-DD HH:mm:ss" 和 "YYYY-MM-DD HH:mm"
        var parts = dateTimeString.split(/[- :]/);
        if (parts.length === 6) {
            // 格式：YYYY-MM-DD HH:mm:ss
            return new Date(
                parseInt(parts[0]),   // 年
                parseInt(parts[1])-1, // 月（0-11）
                parseInt(parts[2]),   // 日
                parseInt(parts[3]),   // 时
                parseInt(parts[4]),   // 分
                parseInt(parts[5])    // 秒
            );
        } else if (parts.length === 5) {
            // 格式：YYYY-MM-DD HH:mm
            return new Date(
                parseInt(parts[0]),   // 年
                parseInt(parts[1])-1, // 月（0-11）
                parseInt(parts[2]),   // 日
                parseInt(parts[3]),   // 时
                parseInt(parts[4]),   // 分
                0                     // 秒
            );
        }
    }
    
    return date;
}

// 初始化和绘制分时图的函数
function initTimeChart(container, stockCode) {
    // 检查容器是否存在
    if (!container) {
        return;
    }
    
    // 创建图表实例，使用canvas渲染器以获得更好的性能
    var chart = echarts.init(container, null, {
        renderer: 'canvas',
        useDirtyRect: true // 使用脏矩形渲染优化
    });
    
    // 存储图表实例
    timeChartInstances[stockCode] = chart;
    
    // 设置图表配置，简化不必要的功能
    var option = {
        grid: {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            containLabel: true
        },
        tooltip: {
            show: false
        },
        xAxis: {
            type: 'category',
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false },
            splitNumber: 3 // 减少分割线数量
        },
        yAxis: {
            type: 'value',
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false },
            splitNumber: 2 // 减少分割线数量
        },
        // 禁用数据缩放以提高性能
        series: [
            {
                type: 'line',
                data: [],
                smooth: false, // 禁用平滑曲线以提高性能
                symbol: 'none',
                lineStyle: {
                    width: 1
                },
                areaStyle: {
                    opacity: 0.1
                },
                animation: false // 禁用动画以提高性能
            }
        ]
    };
    
    chart.setOption(option);
    
    // 添加窗口大小变化监听，使用节流处理
    var resizeHandler = throttle(function() {
        chart.resize();
    }, 100);
    
    window.addEventListener('resize', resizeHandler);
    
    // 存储resize处理函数，以便稍后移除
    chart.resizeHandler = resizeHandler;
    
    return chart;
}

// 根据数据更新图表
function updateTimeChart(chart, parsedData) {
    if (!chart || !parsedData) {
        return;
    }
    
    var preClose = parsedData.preClose;
    var dataPoints = parsedData.dataPoints;
    
    // 准备图表数据，将时间转换为字符串格式以适应category类型X轴
    var chartData = dataPoints.map(function(point) {
        // 将时间对象转换为HH:MM格式的字符串
        var date = new Date(point.time);
        var hours = date.getHours().toString().padStart(2, '0');
        var minutes = date.getMinutes().toString().padStart(2, '0');
        var timeStr = hours + ':' + minutes;
        return [timeStr, point.price];
    });
    
    // 设置线条颜色
    var lineColor = '#333'; // 默认颜色
    var areaColor = '#333';
    
    if (dataPoints.length > 0) {
        var lastPrice = dataPoints[dataPoints.length - 1].price;
        if (lastPrice > preClose) {
            lineColor = '#e33232'; // 红色
            // 使用ECharts兼容的方式定义渐变
            areaColor = {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                    { offset: 0, color: 'rgba(227, 50, 50, 0.5)' },
                    { offset: 1, color: 'rgba(227, 50, 50, 0.1)' }
                ]
            };
        } else if (lastPrice < preClose) {
            lineColor = '#00a854'; // 绿色
            // 使用ECharts兼容的方式定义渐变
            areaColor = {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                    { offset: 0, color: 'rgba(0, 168, 84, 0.5)' },
                    { offset: 1, color: 'rgba(0, 168, 84, 0.1)' }
                ]
            };
        }
    }
    
    // 更新图表配置
    chart.setOption({
        yAxis: {
            min: function(value) {
                // 设置Y轴最小值为略低于最低价格
                return Math.min(value.min, preClose) - (Math.abs(value.max - value.min) * 0.1);
            },
            max: function(value) {
                // 设置Y轴最大值为略高于最高价格
                return Math.max(value.max, preClose) + (Math.abs(value.max - value.min) * 0.1);
            }
        },
        series: [
            {
                data: chartData,
                lineStyle: {
                    color: lineColor
                },
                areaStyle: {
                    color: areaColor
                },
                markLine: {
                    symbol: ['none', 'none'],
                    data: [{
                        yAxis: preClose,
                        lineStyle: {
                            type: 'dashed',
                            color: '#999'
                        }
                    }]
                }
            }
        ]
    });
}

// 处理请求队列
function processRequestQueue() {
    if (requestQueue.length === 0 || activeRequests >= MAX_CONCURRENT_REQUESTS) {
        return;
    }
    
    var request = requestQueue.shift();
    activeRequests++;
    
    request()
        .then(function() {
            activeRequests--;
            processRequestQueue();
        })
        .catch(function() {
            activeRequests--;
            processRequestQueue();
        });
}

// 绘制分时图的主函数
function drawTimeChart(container, stockCode) {
    if (!container || !stockCode) {
        return;
    }
    
    // 确保容器有正确的尺寸
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        // 容器尺寸为0，等待下一次渲染
        return;
    }
    
    // 如果已经存在图表实例，直接更新数据
    if (timeChartInstances[stockCode]) {
        // 使用请求队列控制并发
        requestQueue.push(function() {
            return fetchTimeSharingData(stockCode)
                .then(function(rawData) {
                    if (!rawData) {
                        return;
                    }
                    
                    // 解析数据
                    var parsedData = parseTimeSharingData(rawData);
                    if (!parsedData) {
                        return;
                    }
                    
                    // 更新图表
                    updateTimeChart(timeChartInstances[stockCode], parsedData);
                })
                .catch(function(error) {
                    console.error('更新股票 ' + stockCode + ' 分时图失败:', error);
                });
        });
        processRequestQueue();
    } else {
        // 使用请求队列控制并发
        requestQueue.push(function() {
            return fetchTimeSharingData(stockCode)
                .then(function(rawData) {
                    if (!rawData) {
                        return;
                    }
                    
                    // 解析数据
                    var parsedData = parseTimeSharingData(rawData);
                    if (!parsedData) {
                        return;
                    }
                    
                    // 初始化图表
                    var chart = initTimeChart(container, stockCode);
                    if (!chart) {
                        return;
                    }
                    
                    // 更新图表
                    updateTimeChart(chart, parsedData);
                })
                .catch(function(error) {
                    console.error('绘制股票 ' + stockCode + ' 分时图失败:', error);
                });
        });
        processRequestQueue();
    }
}

// 检查元素是否在可视区域内（兼容跨浏览器）
function isElementInViewport(el) {
    if (!el) {
        return false;
    }
    
    var rect = el.getBoundingClientRect();
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    
    // 检查元素是否完全或部分在视口中
    // 对于分时图，只要部分可见就应该渲染
    return (
        rect.left < viewportWidth &&
        rect.right > 0 &&
        rect.top < viewportHeight &&
        rect.bottom > 0
    );
}

// 渲染可视区域内的分时图
function renderVisibleCharts() {
    var chartContainers = document.querySelectorAll('.time-chart');
    
    // 检查是否有任何容器在视口中
    var anyVisible = false;
    Array.prototype.forEach.call(chartContainers, function(container) {
        if (isElementInViewport(container)) {
            anyVisible = true;
            return false; // 提前退出循环
        }
    });
    
    // 如果没有任何容器在视口中，直接返回
    if (!anyVisible) {
        return;
    }
    
    Array.prototype.forEach.call(chartContainers, function(container) {
        var stockCode = container.getAttribute('data-code');
        
        if (stockCode && isElementInViewport(container) && !visibleStockCodes[stockCode]) {
            // 元素在可视区域内且未渲染过
            visibleStockCodes[stockCode] = true;
            drawTimeChart(container, stockCode);
        }
    });
}

// 刷新所有已渲染的分时图
function refreshTimeCharts() {
    if (Object.keys(visibleStockCodes).length === 0) {
        return;
    }
    
    // 获取所有可见的股票代码
    var stockCodes = Object.keys(visibleStockCodes);
    
    // 使用Promise.all并发处理所有请求
    var promises = Array.prototype.map.call(stockCodes, function(stockCode) {
        // 获取最新的分时数据
        return fetchTimeSharingData(stockCode)
            .then(function(rawData) {
                if (!rawData) {
                    return;
                }
                
                // 解析数据
                var parsedData = parseTimeSharingData(rawData);
                if (!parsedData) {
                    return;
                }
                
                // 获取对应的图表实例
                var chart = timeChartInstances[stockCode];
                if (chart) {
                    // 更新图表
                    updateTimeChart(chart, parsedData);
                }
            });
    });
    
    // 处理所有Promise完成后的情况
    Promise.all(promises)
        .catch(function(error) {
            console.error('刷新分时图失败:', error);
        });
}

// 控制分时图定时刷新的函数
function controlTimeChartRefreshTimer() {
    // 清除之前的定时器
    if (timeChartRefreshTimer) {
        clearInterval(timeChartRefreshTimer);
        timeChartRefreshTimer = null;
    }
    
    // 检查是否在交易时间内
    if (isInTradingHours()) {
        // 在交易时间内，启动定时刷新
        console.log('当前处于交易时间，启动分时图定时刷新');
        // 设置定时器，每60秒执行一次
        timeChartRefreshTimer = setInterval(function() {
            if (isInTradingHours()) {
                refreshTimeCharts();
            } else {
                // 如果不在交易时间内，停止定时器
                console.log('当前已超出交易时间，停止分时图定时刷新');
                clearInterval(timeChartRefreshTimer);
                timeChartRefreshTimer = null;
            }
        }, REFRESH_INTERVAL);
    } else {
        console.log('当前不在交易时间内，不启动分时图定时刷新');
    }
}

// 分时图刷新状态控制变量
var timeChartRefreshTimer = null;

// 显示刷新状态

// 检查当前时间是否在交易时间段内（周一到周五 9:25-15:00）
function isInTradingHours() {
    var now = new Date();
    var day = now.getDay(); // 0-6，0=周日，1-5=周一到周五
    var hours = now.getHours();
    var minutes = now.getMinutes();
    
    // 判断是否为周一到周五
    if (day < 1 || day > 5) {
        return false;
    }
    
    // 判断是否在9:25-15:00之间
    if (hours < 9 || hours > 14) {
        return false;
    }
    
    if (hours === 9 && minutes < 25) {
        return false;
    }
    
    return true;
}

// 获取实时股票数据
function fetchRealTimeStockData() {
    // 如果正在刷新中，直接返回
    if (isRefreshing) {
        return;
    }
    
    var tbody = document.getElementById('stockTableBody');
    // 使用更兼容的方式选择行
    var rows = Array.prototype.slice.call(tbody.getElementsByTagName('tr')).filter(function(row) {
        return !row.querySelector('td[colspan]');
    });
    
    if (rows.length === 0) {
        return;
    }
    
    isRefreshing = true;
    retryCount = 0;
    
    // 收集所有股票代码并生成secid
    var secids = [];
    var codeMap = {}; // 用于存储股票代码和对应的行
    var secidSet = {}; // 用于去重secid
    
    Array.prototype.forEach.call(rows, function(row) {
        // 使用更具体的选择器来获取股票代码，避免获取到错误的数据
        var codeElement = row.querySelector('td.orange-code, td:nth-child(7)'); // 代码列现在是第7列
        if (codeElement) {
            var code = codeElement.textContent.trim();
            // 添加调试信息
            console.log('获取到的代码:', code);
            // 检查代码是否包含数字和字母，排除包含中文的情况
            if (code && /^[\d]+$/.test(code)) {
                // 生成secid：6开头的股票代码使用1.前缀，0或3开头的使用0.前缀
                var prefix = code.startsWith('6') ? '1.' : '0.';
                var secid = prefix + code;
                
                // 只添加不重复的secid到API请求列表
                if (!secidSet[secid]) {
                    secidSet[secid] = true;
                    secids.push(secid);
                }
                
                // 使用股票代码作为键，确保唯一性
                var uniqueKey = code;
                codeMap[uniqueKey] = row;
            } else {
                console.log('跳过无效代码:', code);
            }
        }
    });
    
    if (secids.length === 0) {
        return;
    }
    
    // 构建API URL
    // 使用后端代理API避免CORS问题
    var apiUrl = '/api/proxy-eastmoney-stock-data?secids=' + secids.join(',');
    
    // 发送API请求获取实时数据
    fetch(apiUrl)
        .then(function(response) {
            if (!response.ok) {
                throw new Error('网络响应错误');
            }
            return response.json();
        })
        .then(function(data) {
            // 检查返回数据是否有效
            if (data && data.data && data.data.diff) {
                // 更新表格
                updateStockTable(data.data.diff, rows, codeMap);
                retryCount = 0;
            } else {
                throw new Error('无效的返回数据');
            }
        })
        .catch(function(error) {
            console.error('获取实时股票数据失败:', error);
            
            retryCount++;
            
            if (retryCount < MAX_RETRIES) {
                // 重试
                setTimeout(function() {
                    fetchRealTimeStockData();
                }, 3000); // 3秒后重试
            } else {
                // 达到最大重试次数
                // 不再重试，因为后端已经有降级处理机制
                retryCount = 0;
            }
        })
        .finally(function() {
            // 刷新完成
            isRefreshing = false;
        });
}

// 更新股票表格数据的辅助函数
function updateStockTable(data, rows, codeMap) {
    // 日志记录接收到的数据
    console.log('接收到的股票数据:', data);
    
    if (!data || data.length === 0) {
        console.log('无数据可更新');
        return;
    }
    
    console.log(`正在更新 ${data.length} 条股票数据`);
    
    // 遍历所有股票数据
    Array.prototype.forEach.call(data, function(stock) {
        console.log('处理股票数据:', stock);
        
        // 获取股票代码（f12字段）
        var code = stock.f12;
        if (!code) {
            console.warn('股票数据缺少代码字段:', stock);
            return;
        }
        
        // 获取价格、涨幅、成交额和流通市值，提供默认值以防止显示错误
        var price = stock.f2 !== undefined && stock.f2 !== null ? stock.f2 : 0;
        var changePercent = stock.f3 !== undefined && stock.f3 !== null ? stock.f3 : 0;
        var amount = stock.f6 !== undefined && stock.f6 !== null ? stock.f6 : 0;
        var value = stock.f10 !== undefined && stock.f10 !== null ? stock.f10 : 0;
        
        // 查找所有包含该股票代码的行
        Array.prototype.forEach.call(rows, function(row) {
            var rowCodeElement = row.querySelector('td:nth-child(7)'); // 代码列现在是第7列
            if (rowCodeElement) {
                var rowCode = rowCodeElement.textContent.trim();
                if (rowCode === code) {
                    var uniqueKey = rowCode;
                    var targetRow = codeMap[uniqueKey];
                    
                    if (targetRow) {
                        // 确定颜色（红色上涨，绿色下跌，灰色平）
                        var color = changePercent > 0 ? '#e33232' : (changePercent < 0 ? '#00a854' : '#666666');
                        
                        // 更新价格 - 确保价格格式正确
                        var priceElement = targetRow.querySelector('.price');
                        if (priceElement) {
                            try {
                                // 尝试将价格转换为数字并格式化
                                var priceNum = parseFloat(price);
                                if (!isNaN(priceNum) && priceNum >= 0) {
                                    priceElement.textContent = priceNum.toFixed(2);
                                    priceElement.style.color = color;
                                } else {
                                    console.warn(`股票 ${code} 价格数据异常:`, price);
                                    priceElement.textContent = '--';
                                    priceElement.style.color = '#666666';
                                }
                            } catch (e) {
                                console.error(`格式化价格出错:`, e);
                                priceElement.textContent = '--';
                                priceElement.style.color = '#666666';
                            }
                        }
                        
                        // 更新涨跌幅 - 确保百分比格式正确
                        var changeElement = targetRow.querySelector('.change-percentage');
                        if (changeElement) {
                            try {
                                // 尝试将涨幅转换为数字并格式化
                                var changeNum = parseFloat(changePercent);
                                if (!isNaN(changeNum)) {
                                    changeElement.textContent = changeNum.toFixed(2) + '%';
                                    changeElement.style.color = color;
                                } else {
                                    console.warn(`股票 ${code} 涨跌幅数据异常:`, changePercent);
                                    changeElement.textContent = '--%';
                                    changeElement.style.color = '#666666';
                                }
                            } catch (e) {
                                console.error(`格式化涨跌幅出错:`, e);
                                changeElement.textContent = '--%';
                                changeElement.style.color = '#666666';
                            }
                        }
                        
                        // 更新成交额
                        var amountElement = targetRow.querySelector('.amount');
                        if (amountElement) {
                            try {
                                // 尝试将成交额转换为数字并格式化
                                var amountNum = parseFloat(amount);
                                if (!isNaN(amountNum) && amountNum >= 0) {
                                    // 格式化成交额，超过1亿显示为亿，超过1万显示为万
                                    if (amountNum >= 100000000) {
                                        amountElement.textContent = (amountNum / 100000000).toFixed(2) + '亿';
                                    } else if (amountNum >= 10000) {
                                        amountElement.textContent = (amountNum / 10000).toFixed(2) + '万';
                                    } else {
                                        amountElement.textContent = amountNum.toFixed(2);
                                    }
                                } else {
                                    console.warn(`股票 ${code} 成交额数据异常:`, amount);
                                    amountElement.textContent = '--';
                                }
                            } catch (e) {
                                console.error(`格式化成交额出错:`, e);
                                amountElement.textContent = '--';
                            }
                        }
                        
                        // 更新流通市值
                        var valueElement = targetRow.querySelector('.value');
                        if (valueElement) {
                            try {
                                // 尝试将流通市值转换为数字并格式化
                                var valueNum = parseFloat(value);
                                if (!isNaN(valueNum) && valueNum >= 0) {
                                    // 格式化流通市值，超过1亿显示为亿，超过1万显示为万
                                    if (valueNum >= 100000000) {
                                        valueElement.textContent = (valueNum / 100000000).toFixed(2) + '亿';
                                    } else if (valueNum >= 10000) {
                                        valueElement.textContent = (valueNum / 10000).toFixed(2) + '万';
                                    } else {
                                        valueElement.textContent = valueNum.toFixed(2);
                                    }
                                } else {
                                    console.warn(`股票 ${code} 流通市值数据异常:`, value);
                                    valueElement.textContent = '--';
                                }
                            } catch (e) {
                                console.error(`格式化流通市值出错:`, e);
                                valueElement.textContent = '--';
                            }
                        }
                    }
                }
            }
        });
    });
}

// 排序状态变量（全局）
var isSortedDesc = false; // 几天几板排序状态
var isChangeSortedDesc = false; // 涨跌幅排序状态
var isAmountSortedDesc = false; // 成交额排序状态

// 排序函数
function sortTable(columnIndex) {
    // ... 现有排序逻辑不变 ...
}

// 为几天几板列单独维护排序状态
var isDaysBoardsSortedDesc = false;

function sortByDaysBoards() {
    var tbody = document.getElementById('stockTableBody');
    var rows = Array.prototype.slice.call(tbody.getElementsByTagName('tr')).filter(function(row) {
        return !row.querySelector('td[colspan]');
    });
    var header = document.querySelector('th.sortable:nth-child(9)');
    
    // 解析几天几板中的数字
    function getBoardCount(text) {
        if (!text) return 0;
        // 匹配天数和板数，例如 "3天3板" 会匹配到两个数字 [3, 3]
        var matches = text.match(/\d+/g);
        if (matches) {
            // 优先使用板数（第二个数字），如果没有则使用天数（第一个数字）
            return parseInt(matches[matches.length - 1]);
        }
        return 0;
    }
    
    // 先确定当前排序方向
    var currentIsDesc = isDaysBoardsSortedDesc;
    
    // 排序
    rows.sort(function(a, b) {
        var aCount = getBoardCount(a.cells[8].textContent);
        var bCount = getBoardCount(b.cells[8].textContent);
        
        if (currentIsDesc) {
            return aCount - bCount; // 升序
        } else {
            return bCount - aCount; // 降序
        }
    });
    
    // 重新添加行
    Array.prototype.forEach.call(rows, function(row) {
        tbody.appendChild(row);
    });
    
    // 更新排序状态
    isDaysBoardsSortedDesc = !isDaysBoardsSortedDesc;
    
    // 更新表头样式
    if (header) {
        // 移除其他排序表头的sorted类
        document.querySelectorAll('th.sortable').forEach(function(th) {
            th.classList.remove('sorted');
        });
        // 根据刚刚执行的排序方向添加sorted类
        // 如果刚刚执行的是升序（currentIsDesc为true），则显示向上箭头
        // 如果刚刚执行的是降序（currentIsDesc为false），则显示向下箭头
        if (currentIsDesc) {
            header.classList.add('sorted');
        }
    }
}

function sortByChangePercentage() {
    console.log('开始涨跌幅排序...');
    var tbody = document.getElementById('stockTableBody');
    var rows = Array.prototype.slice.call(tbody.getElementsByTagName('tr')).filter(function(row) {
        return !row.querySelector('td[colspan]');
    });
    var header = document.querySelector('th.sortable:nth-child(4)');
    
    // 解析涨跌幅百分比数值
    function getChangePercentage(element) {
        if (!element) {
            console.log('元素不存在');
            return 0;
        }
        // 直接从td元素获取文本（td本身就有change-percentage类）
        var text = element.textContent || '';
        console.log('涨跌幅文本:', text);
        if (!text) return 0;
        // 移除%符号并转换为数字
        var matches = text.match(/[-+]?\d+(?:\.\d+)?/);
        if (matches) {
            var value = parseFloat(matches[0]);
            console.log('解析的数值:', value);
            return value;
        }
        console.log('未找到匹配的数值');
        return 0;
    }
    
    // 排序前记录一些数据
    console.log('排序前的前5行数据:');
    for (var i = 0; i < Math.min(5, rows.length); i++) {
        var cell = rows[i].cells[3];
        var text = cell.textContent || '';
        console.log('行' + (i+1) + ': ' + text);
    }
    
    // 先确定当前排序方向
    var currentIsDesc = isChangeSortedDesc;
    
    // 排序
    rows.sort(function(a, b) {
        var aChange = getChangePercentage(a.cells[3]); // 涨跌幅是第4列，索引为3
        var bChange = getChangePercentage(b.cells[3]);
        
        console.log('比较:', aChange, 'vs', bChange);
        
        if (currentIsDesc) {
            return aChange - bChange; // 升序
        } else {
            return bChange - aChange; // 降序
        }
    });
    
    // 排序后记录一些数据
    console.log('排序后的前5行数据:');
    for (var i = 0; i < Math.min(5, rows.length); i++) {
        var cell = rows[i].cells[3];
        var text = cell.textContent || '';
        console.log('行' + (i+1) + ': ' + text);
    }
    
    // 重新添加行
    Array.prototype.forEach.call(rows, function(row) {
        tbody.appendChild(row);
    });
    
    // 更新排序状态
    isChangeSortedDesc = !isChangeSortedDesc;
    console.log('更新排序状态为:', isChangeSortedDesc);
    
    // 更新表头样式
    if (header) {
        // 移除其他排序表头的sorted类
        document.querySelectorAll('th.sortable').forEach(function(th) {
            th.classList.remove('sorted');
        });
        // 根据刚刚执行的排序方向添加sorted类
        if (currentIsDesc) {
            header.classList.add('sorted');
        }
    }
}

function sortByAmount() {
    console.log('开始成交额排序...');
    var tbody = document.getElementById('stockTableBody');
    var rows = Array.prototype.slice.call(tbody.getElementsByTagName('tr')).filter(function(row) {
        return !row.querySelector('td[colspan]');
    });
    var header = document.querySelector('th.sortable:nth-child(6)'); // 成交额列现在是第6列
    
    // 解析成交额数值
    function getAmountValue(text) {
        if (!text || text === '--') return 0;
        // 处理亿和万的情况
        if (text.includes('亿')) {
            return parseFloat(text.replace('亿', '')) * 100000000;
        } else if (text.includes('万')) {
            return parseFloat(text.replace('万', '')) * 10000;
        } else {
            return parseFloat(text) || 0;
        }
    }
    
    // 排序前记录一些数据
    console.log('排序前的前5行数据:');
    for (var i = 0; i < Math.min(5, rows.length); i++) {
        var cell = rows[i].cells[5]; // 成交额是第6列，索引为5
        var text = cell.textContent || '';
        console.log('行' + (i+1) + ': ' + text);
    }
    
    // 先确定当前排序方向
    var currentIsDesc = isAmountSortedDesc;
    
    // 排序
    rows.sort(function(a, b) {
        var aAmount = getAmountValue(a.cells[5].textContent); // 成交额是第6列，索引为5
        var bAmount = getAmountValue(b.cells[5].textContent);
        
        console.log('比较:', aAmount, 'vs', bAmount);
        
        if (currentIsDesc) {
            return aAmount - bAmount; // 升序
        } else {
            return bAmount - aAmount; // 降序
        }
    });
    
    // 排序后记录一些数据
    console.log('排序后的前5行数据:');
    for (var i = 0; i < Math.min(5, rows.length); i++) {
        var cell = rows[i].cells[5]; // 成交额是第6列，索引为5
        var text = cell.textContent || '';
        console.log('行' + (i+1) + ': ' + text);
    }
    
    // 重新添加行
    Array.prototype.forEach.call(rows, function(row) {
        tbody.appendChild(row);
    });
    
    // 更新排序状态
    isAmountSortedDesc = !isAmountSortedDesc;
    console.log('更新排序状态为:', isAmountSortedDesc);
    
    // 更新表头样式
    if (header) {
        // 移除其他排序表头的sorted类
        document.querySelectorAll('th.sortable').forEach(function(th) {
            th.classList.remove('sorted');
        });
        // 根据刚刚执行的排序方向添加sorted类
        if (currentIsDesc) {
            header.classList.add('sorted');
        }
    }
}

// 题材筛选功能
function filterByPlate(plateValue) {
    const tbody = document.getElementById('stockTableBody');
    // 使用更兼容的方式选择行
    const rows = Array.prototype.slice.call(tbody.getElementsByTagName('tr')).filter(function(row) {
        const cells = row.getElementsByTagName('td');
        return cells.length > 0 && cells[0].getAttribute('colspan') === null;
    });
    
    if (!plateValue || plateValue.trim() === '') {
        // 如果没有输入筛选条件，显示所有行
        rows.forEach(row => {
            row.style.display = '';
        });
        return;
    }
    
    // 对每一行进行题材内容的匹配
    rows.forEach(row => {
        // 选择题材列（第11列，索引10）
        const plateElement = row.getElementsByTagName('td')[10];
        if (plateElement) {
            const plate = plateElement.textContent.trim();
            // 检查题材列是否包含搜索词
            const isMatch = plate.toLowerCase().includes(plateValue.toLowerCase());
            // 使用display来控制显示/隐藏
            row.style.display = isMatch ? '' : 'none';
        } else {
            // 如果找不到题材列，则隐藏该行
            row.style.display = 'none';
        }
    });
}

// 为DOM加载完成后，为搜索框添加防抖处理
document.addEventListener('DOMContentLoaded', function() {
    const plateFilter = document.getElementById('plateFilter');
    if (plateFilter) {
        // 移除内联的oninput处理
        plateFilter.removeAttribute('oninput');
        // 添加防抖处理的事件监听
        const debouncedFilter = debounce(filterByPlate, 300);
        plateFilter.addEventListener('input', function() {
            debouncedFilter(this.value);
        });
    }
});

// 题材统计功能
function updatePlateStats() {
    // 统计结果对象
    var plateCounts = {};
    
    // 获取所有股票行
    var rows = document.querySelectorAll('#stockTableBody tr');
    
    // 遍历每一行
    rows.forEach(function(row) {
        // 优先通过class名称查找题材列，提高代码健壮性
        var plateCell = row.querySelector('td.plate-column');
        // 如果没有找到，再尝试通过索引查找（兼容旧结构）
        if (!plateCell) {
            plateCell = row.cells[10];
        }
        if (plateCell) {
            // 获取题材内容
            var plateContent = plateCell.textContent.trim();
            
            // 如果存在题材内容
            if (plateContent && plateContent !== 'undefined' && plateContent !== null) {
                // 使用顿号分割多个题材
                var plates = plateContent.split('、');
                
                // 遍历每个题材
                plates.forEach(function(plate) {
                    // 去除空白字符
                    plate = plate.trim();
                    if (plate) {
                        // 更新统计计数
                        if (plateCounts[plate]) {
                            plateCounts[plate]++;
                        } else {
                            plateCounts[plate] = 1;
                        }
                    }
                });
            }
        }
    });
    
    // 将统计结果转换为数组并排序（按数量降序）
    var sortedPlates = Object.entries(plateCounts)
        .map(function([plate, count]) {
            return { plate: plate, count: count };
        })
        .sort(function(a, b) {
            return b.count - a.count;
        });
    
    // 更新右侧统计表
    var statsTableBody = document.getElementById('plateStatsBody');
    if (statsTableBody) {
        // 清空现有内容
        statsTableBody.innerHTML = '';
        
        // 如果有统计数据
        if (sortedPlates.length > 0) {
            // 遍历排序后的题材数组
            sortedPlates.forEach(function(item) {
                var row = document.createElement('tr');
                
                // 创建题材名称单元格
                var plateCell = document.createElement('td');
                plateCell.textContent = item.plate;
                plateCell.className = 'plate-name';
                
                // 创建数量单元格
                var countCell = document.createElement('td');
                countCell.textContent = item.count;
                countCell.className = 'plate-count';
                
                // 添加单元格到行
                row.appendChild(plateCell);
                row.appendChild(countCell);
                
                // 添加行到表格
                statsTableBody.appendChild(row);
            });
        } else {
            // 如果没有统计数据，显示提示信息
            var row = document.createElement('tr');
            var cell = document.createElement('td');
            cell.colSpan = 2;
            cell.textContent = '暂无题材数据';
            cell.className = 'no-data';
            row.appendChild(cell);
            statsTableBody.appendChild(row);
        }
    }
}

// 监听表格内容变化并更新统计
function setupPlateStatsListener() {
    // 初始加载时更新统计
    updatePlateStats();
    
    // 监听表格内容变化
    var observer = new MutationObserver(function() {
        updatePlateStats();
    });
    
    // 观察表格主体的子节点变化
    var tableBody = document.getElementById('stockTableBody');
    if (tableBody) {
        observer.observe(tableBody, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: false
        });
    }
}

// 题材搜索功能
function searchPlate() {
    // 获取搜索框输入值
    const searchInput = document.getElementById('plateSearchInput');
    const searchTerm = searchInput.value.trim().toLowerCase();
    
    if (!searchTerm) {
        // 如果没有搜索条件，不执行搜索
        return;
    }
    
    // 调用后端API搜索所有日期的题材数据
    fetch(`/api/filter-plate-all-dates?plate=${encodeURIComponent(searchTerm)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            const tbody = document.getElementById('stockTableBody');
            tbody.innerHTML = '';
            
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="no-data">没有找到匹配的题材数据</td></tr>';
                return;
            }
            
            // 渲染搜索结果到左侧表格
            Array.prototype.forEach.call(data, function(stock) {
                var row = document.createElement('tr');
                var link = 'https://xuangutong.com.cn/stock/' + stock.code_part + '.' + stock.market.toUpperCase();
                var codeClass = stock.code_part.startsWith('3') ? 'orange-code' : '';
                var nameClass = stock.code_part.startsWith('688') ? 'stock-name-link blue-text' : (stock.code_part.startsWith('3') || stock.code_part.startsWith('68')) ? 'stock-name-link orange-text' : 'stock-name-link';
                row.innerHTML = 
                    '<td><a href="' + link + '" target="_blank" class="' + nameClass + '">' + stock.name + '</a></td>' +
                    '<td><div class="time-chart" data-code="' + stock.code_part + '"></div></td>' +
                    '<td class="price"></td>' +
                    '<td class="change-percentage"></td>' +
                    '<td class="amount"></td>' +
                    '<td class="value"></td>' +
                    '<td style="display: none;" class="' + codeClass + '">' + stock.code_part + '</td>' +
                    '<td style="display: none;">' + stock.market + '</td>' +
                    '<td>' + (stock.m_days_n_boards ? '<span class="days-boards-tag">' + stock.m_days_n_boards + '</span>' : stock.m_days_n_boards) + '</td>' +
                    '<td>' + (stock.description ? stock.description.substring(0, 100) + (stock.description.length > 100 ? '...' : '') : '') + '</td>' +
                    '<td class="plate-column">' + stock.plates + '</td>';
                
                // 强制设置题材列宽度
                var plateColumn = row.querySelector('td.plate-column');
                if (plateColumn) {
                    plateColumn.style.width = '120px';
                    plateColumn.style.minWidth = '120px';
                    plateColumn.style.maxWidth = '120px';
                    plateColumn.style.overflow = 'hidden';
                    plateColumn.style.padding = '4px';
                    plateColumn.style.boxSizing = 'border-box';
                }
                tbody.appendChild(row);
            });
            
            // 重置分时图状态并重新渲染
            visibleStockCodes = {}; // 重置可见股票代码集合
            timeChartInstances = {}; // 重置图表实例
            setTimeout(function() {
                renderVisibleCharts(); // 重新渲染可见区域内的分时图
                fetchRealTimeStockData(); // 获取实时股票数据
                // 更新题材统计
                updatePlateStats();
                // 重新绑定K线图事件
                if (typeof initStockNameEvents === 'function') {
                    initStockNameEvents();
                }
            }, 100);
        })
        .catch(function(error) {
            console.error('搜索题材数据失败:', error);
            const tbody = document.getElementById('stockTableBody');
            tbody.innerHTML = '<tr><td colspan="10" class="no-data">搜索题材数据时发生错误</td></tr>';
        });
}

// 为搜索框添加回车键事件
document.addEventListener('DOMContentLoaded', function() {
    const plateSearchInput = document.getElementById('plateSearchInput');
    if (plateSearchInput) {
        plateSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchPlate();
            }
        });
    }
    
    // 检查filterByDate函数，在其末尾添加更新统计的代码
    // 如果是通过API加载的数据，需要在数据加载完成后更新统计
    setupPlateStatsListener();
    
    // 立即执行一次统计，确保页面加载时显示题材统计数据
    setTimeout(function() {
        updatePlateStats();
    }, 300); // 稍微延迟一下，确保DOM完全加载
    
    // 初始化K线图相关事件
    if (typeof initStockNameEvents === 'function') {
        initStockNameEvents();
    }
});