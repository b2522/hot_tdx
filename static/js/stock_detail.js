// stock_detail.js - 股票详情页的JS功能

// 获取实时股票数据
function fetchRealTimeStockData() {
    const tbody = document.getElementById('stockHistoryTableBody');
    const rows = tbody.querySelectorAll('tr:not(:has(td[colspan]))');
    
    if (rows.length === 0) {
        return;
    }
    
    // 收集股票代码并格式化
    const code = '{{ stock_code }}';
    let market = '';
    if (code.startsWith('6')) {
        market = 'SH';
    } else if (code.startsWith('0') || code.startsWith('3')) {
        market = 'SZ';
    }
    
    if (!market) {
        return;
    }
    
    const formattedCode = `${market}${code}`;
    const stockCodes = [formattedCode]; // 只添加一次股票代码
    
    // 构建API URL（使用后端代理）
    const apiUrl = `/api/realtime-stock-data?symbols=${stockCodes.join(',')}&_=${Date.now()}`;
    
    // 发送API请求获取实时数据
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应错误');
            }
            return response.json();
        })
        .then(data => {
            // 检查返回数据是否有效
            if (data && data.data && data.data.length > 0) {
                // 获取股票数据
                const stock = data.data[0];
                
                // 确定颜色（红色上涨，绿色下跌，黑色不变）
                const color = stock.percent > 0 ? '#e33232' : (stock.percent < 0 ? '#00a854' : '');
                
                // 将数据应用到所有行
                rows.forEach(row => {
                    // 更新价格
                    const priceElement = row.querySelector('.price');
                    if (priceElement) {
                        priceElement.textContent = stock.current || '-';
                        priceElement.style.color = color;
                    }
                    
                    // 更新涨跌幅
                    const changeElement = row.querySelector('.change-percentage');
                    if (changeElement) {
                        changeElement.textContent = (stock.percent || 0).toFixed(2) + '%';
                        changeElement.style.color = color;
                    }
                });
            }
        })
        .catch(error => {
            console.error('获取实时股票数据失败:', error);
            console.error('API请求URL:', apiUrl);
            console.error('股票代码:', formattedCode);
        });
}

// 显示大图分时图
function showFullChart(code) {
    // 创建模态框
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1000';
    
    // 创建图表容器
    const chartContainer = document.createElement('div');
    chartContainer.style.backgroundColor = 'white';
    chartContainer.style.padding = '20px';
    chartContainer.style.borderRadius = '10px';
    chartContainer.style.position = 'relative';
    
    // 创建关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '10px';
    closeBtn.style.right = '10px';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#333';
    
    // 创建大图
    const fullChart = document.createElement('img');
    fullChart.src = `https://image.sinajs.cn/newchart/min/${code}.gif`;
    fullChart.style.width = '100%';
    fullChart.style.maxWidth = '1000px';
    fullChart.style.height = 'auto';
    
    // 添加事件监听
    closeBtn.onclick = () => {
        document.body.removeChild(modal);
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
    
    // 组装并显示
    chartContainer.appendChild(closeBtn);
    chartContainer.appendChild(fullChart);
    modal.appendChild(chartContainer);
    document.body.appendChild(modal);
}

// 绘制分时图
function drawTimeSharingChart() {
    const stockCode = '{{ stock_code }}';
    console.log('开始绘制分时图，股票代码:', stockCode);
    
    // 检查图表容器
    const chartDom = document.getElementById('timeSharingChart');
    if (!chartDom) {
        console.error('分时图容器元素不存在');
        return;
    }
    console.log('图表容器存在，尺寸:', chartDom.offsetWidth, 'x', chartDom.offsetHeight);
    
    // 检查ECharts库
    if (typeof echarts === 'undefined') {
        console.error('echarts库未加载');
        return;
    }
    console.log('ECharts库已加载，版本:', echarts.version);
    
    const myChart = echarts.init(chartDom);
    console.log('图表实例已初始化');
    
    // 获取分时数据
    const apiUrl = `/api/time-sharing-data?code=${stockCode}`;
    console.log('请求分时数据，URL:', apiUrl);
    
    fetch(apiUrl)
        .then(response => {
            console.log('API响应状态:', response.status);
            if (!response.ok) {
                throw new Error(`网络响应错误: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('获取到分时数据:', data);
            
            // 验证数据结构
            if (!data || typeof data !== 'object') {
                throw new Error('数据格式不正确: 不是有效的JSON对象');
            }
            
            if (!data.data || typeof data.data !== 'object') {
                throw new Error('数据格式不正确: 缺少data字段');
            }
            
            if (!Array.isArray(data.data.trends)) {
                throw new Error('数据格式不正确: trends不是数组');
            }
            
            if (data.data.trends.length === 0) {
                console.warn('分时数据为空');
                return;
            }
            
            const trends = data.data.trends;
            const preClose = parseFloat(data.data.preClose); // 前收盘价
            
            console.log('trends数据长度:', trends.length);
            console.log('前收盘价:', preClose);
            console.log('第一条数据:', trends[0]);
            console.log('最后一条数据:', trends[trends.length - 1]);
            
            // 解析数据
            const processedData = [];
            for (let i = 0; i < trends.length; i++) {
                const items = trends[i].split(',');
                if (items.length >= 4) {
                    const time = items[0];
                    const price = parseFloat(items[1]);
                    processedData.push({
                        time: time,
                        price: price
                    });
                }
            }
            
            console.log('处理后的数据长度:', processedData.length);
            
            // 设置x轴数据（时间）
            const xAxisData = processedData.map(item => item.time);
            console.log('x轴数据长度:', xAxisData.length);
            
            // 将数据分成多个连续的段，每段的价格要么都大于等于preClose，要么都小于preClose
            const segments = [];
            let currentSegment = [];
            let currentStatus = null; // null, 'up' 或 'down'
            
            processedData.forEach((item, index) => {
                const price = item.price;
                let status = 'equal';
                
                if (price > preClose) {
                    status = 'up';
                } else if (price < preClose) {
                    status = 'down';
                }
                
                // 如果是第一个数据点，或者状态发生变化，创建新的段
                if (index === 0 || status !== currentStatus) {
                    if (currentSegment.length > 0) {
                        segments.push({ status: currentStatus, data: [...currentSegment] });
                    }
                    currentSegment = [price];
                    currentStatus = status;
                } else {
                    // 否则继续添加到当前段
                    currentSegment.push(price);
                }
            });
            
            // 添加最后一个段
            if (currentSegment.length > 0) {
                segments.push({ status: currentStatus, data: [...currentSegment] });
            }
            
            console.log('数据段数量:', segments.length);
            
            // 为每个数据段创建一个series
            const series = segments.map((segment, index) => {
                // 计算当前段在x轴上的起始和结束索引
                let startIndex = 0;
                for (let i = 0; i < index; i++) {
                    startIndex += segments[i].data.length;
                }
                
                // 为每个段创建完整的数据数组，非当前段的位置使用null
                const fullData = [];
                for (let i = 0; i < xAxisData.length; i++) {
                    if (i >= startIndex && i < startIndex + segment.data.length) {
                        fullData.push(segment.data[i - startIndex]);
                    } else {
                        fullData.push(null);
                    }
                }
                
                // 设置颜色
                let color = '#333'; // 默认颜色
                if (segment.status === 'up' || segment.status === 'equal') {
                    color = '#e33232'; // 红色 (价格大于或等于前收盘价)
                } else if (segment.status === 'down') {
                    color = '#00a854'; // 绿色 (价格小于前收盘价)
                }
                
                return {
                    name: '价格',
                    type: 'line',
                    data: fullData,
                    lineStyle: {
                        width: 2,
                        color: color
                    },
                    symbol: 'none',
                    smooth: true,
                    connectNulls: false,
                    itemStyle: {
                        color: color
                    }
                };
            });
            
            // 添加一个隐藏的series用于区域填充
            series.push({
                name: '价格',
                type: 'line',
                data: processedData.map(item => item.price),
                lineStyle: {
                    width: 0 // 隐藏线条
                },
                symbol: 'none',
                smooth: true,
                itemStyle: {
                    opacity: 0 // 隐藏数据点
                },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [{
                            offset: 0, color: 'rgba(227, 50, 50, 0.3)'
                        }, {
                            offset: 1, color: 'rgba(0, 168, 84, 0.3)'
                        }]
                    }
                }
            });
            
            // 渲染图表
            const option = {
                title: {
                    text: '分时走势图',
                    left: 'center',
                    textStyle: {
                        color: '#333',
                        fontSize: 16
                    }
                },
                tooltip: {
                    trigger: 'axis',
                    formatter: function(params) {
                        // 找到第一个有值的参数
                        const validParam = params.find(p => p.value !== null);
                        if (validParam) {
                            const time = validParam.axisValue;
                            const price = validParam.value;
                            return `${time}<br/>价格: ${price.toFixed(2)}`;
                        }
                        return '';
                    }
                },
                grid: {
                    left: '5%',
                    right: '5%',
                    bottom: '10%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    boundaryGap: false,
                    data: xAxisData,
                    axisLabel: {
                        formatter: function(value) {
                            try {
                                const parts = value.split(' ');
                                if (parts.length > 1) {
                                    const timeStr = parts[1];
                                    const timeParts = timeStr.split(':');
                                    return `${timeParts[0]}:${timeParts[1]}`;
                                }
                                return value;
                            } catch (error) {
                                console.error('格式化时间出错:', error);
                                return value;
                            }
                        },
                        rotate: 45,
                        fontSize: 10
                    }
                },
                yAxis: {
                    type: 'value',
                    scale: true,
                    axisLabel: {
                        formatter: '{value}'
                    },
                    splitLine: {
                        show: true,
                        lineStyle: {
                            type: 'dashed'
                        }
                    }
                },
                series: series
            };
            
            console.log('图表配置已创建，准备渲染');
            myChart.setOption(option);
            console.log('图表渲染完成');
            
            // 添加窗口大小变化监听
            window.addEventListener('resize', function() {
                myChart.resize();
                console.log('图表已调整大小');
            });
        })
        .catch(error => {
            console.error('获取分时数据失败:', error);
            // 显示错误信息到图表
            const option = {
                title: {
                    text: '获取分时数据失败',
                    subtext: error.message,
                    left: 'center',
                    textStyle: {
                        color: '#e33232',
                        fontSize: 16
                    },
                    subtextStyle: {
                        color: '#666',
                        fontSize: 12
                    }
                }
            };
            myChart.setOption(option);
        });
}

// 页面加载完成后绘制分时图
document.addEventListener('DOMContentLoaded', function() {
    fetchRealTimeStockData();
    drawTimeSharingChart();
});
