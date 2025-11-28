const GAS_URL = 'Change this to GAS URL.'; 

const tableBody = document.getElementById('dataTable').getElementsByTagName('tbody')[0];
const statusElement = document.getElementById('status');
let co2ChartInstance = null;
let humidChartInstance = null;

//予測値が閾値を下回るまで警告の再送を防ぐ
let hasSentPredictionNotification = false; 

//年月日整形
function formatDate(date) {
    const pad = (number) => String(number).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}


//GASデータ取得
async function fetchFromGas() {
    try {
        const response = await fetch(GAS_URL);
        
        if (!response.ok) {
            throw new Error(`HTTPエラー: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 時刻順にソート (新しいデータが先頭に来るように降順ソート)
        data.sort((a, b) => b.time - a.time);
        
        return data; // ソート済みのデータを返す
        
    } catch (error) {
        console.error("データの取得中にエラーが発生しました:", error);
        return null;
    }
}

//線形回帰予測
function linearRegression(x, y) {
    if (x.length !== y.length || x.length < 2) {
        return { m: 0, b: y.length > 0 ? y[y.length - 1] : 0 };
    }

    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumXX += x[i] * x[i];
    }

    const denominator = n * sumXX - sumX * sumX;
    const m = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;

    const b = (sumY - m * sumX) / n;

    return { m, b };
}


//WBGT近似計算
function approximateWBGT(T, RH) {
    if (typeof T !== 'number' || typeof RH !== 'number') {
        return NaN; 
    }

    const termT = (0.735 + 0.00657) * T;
    const termRHLinear = 0.0276 * RH;
    const termRHExp = 0.401 * Math.exp(-0.00517 * RH);
    const constantTerm = -3.70;

    const WBGT = termT + termRHLinear + termRHExp + constantTerm;

    return Math.round(WBGT * 10) / 10;
}

//通知リクエスト
async function sendNotificationRequest() {
    try {
        const response = await fetch('http://localhost:3000/sendNotification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) 
        });

        if (response.ok) {
            console.log("通知リクエストOK");
        } else {
            console.error(`通知リクエストFAIL HTTP Status: ${response.status}`);
        }
    } catch (error) {
        console.error("通知リクエストの送信ERROR", error);
    }
}

//指標カード
function renderIndicatorCards(data) {
    if (!data || data.length === 0) return;
    
    const latest = data[0]; //最新データ
    const co2 = parseInt(latest.co2);
    const temp = parseFloat(latest.temp).toFixed(1);
    const humid = parseFloat(latest.humid).toFixed(1);

    //CO2カード
    const co2Card = document.getElementById('co2StatusCard');
    const co2Text = document.getElementById('currentCo2');
    const co2IconContainer = document.getElementById('co2Icon');
    const co2Comment = document.getElementById('co2Comment');
    
    //温度，湿度，CO2カードの更新
    document.getElementById('currentTemp').textContent = `${temp} °C`;
    document.getElementById('currentHumid').textContent = `${humid} %`;
    
    co2Text.textContent = `${co2} ppm`;

    co2Card.classList.remove('border-green-500', 'border-orange-500', 'border-red-600', 'bg-red-50');
    co2IconContainer.classList.remove('text-green-500', 'text-orange-500', 'text-red-600');
    co2Comment.classList.remove('text-green-500', 'text-orange-500', 'text-red-600');
    co2IconContainer.innerHTML = '';

    if (co2 >= 950) {
        //警告レベル (赤)
        co2Card.classList.add('border-red-600', 'bg-red-50');
        co2IconContainer.classList.add('text-red-600');
        co2Comment.classList.add('text-red-600');
        co2Comment.textContent = '危険！いますぐ換気が必要です！';
        co2IconContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        `; // 警告アイコン
    } else if (co2 >= 800) {
        //注意レベル (オレンジ)
        co2Card.classList.add('border-orange-500');
        co2IconContainer.classList.add('text-orange-500');
        co2Comment.classList.add('text-orange-500');
        co2Comment.textContent = '注意！換気を検討してください。';
        co2IconContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        `;
    } else {
        //正常レベル (緑)
        co2Card.classList.add('border-green-500');
        co2IconContainer.classList.add('text-green-500');
        co2Comment.classList.add('text-green-500');
        co2Comment.textContent = '換気は十分です。';
        co2IconContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
        `;
    }
    
    //CO2予測値計算
    const sortedData = [...data].reverse();
    if (sortedData.length < 5) {
        //データ少なすぎ
        return; 
    }
    
    const timestamps = sortedData.map(item => item.time);
    const co2Values = sortedData.map(item => parseInt(item.co2));
    const { m, b } = linearRegression(timestamps, co2Values);
    const latestTime = sortedData[sortedData.length - 1].time;
    
    const futureTime15Min = latestTime + (15 * 60); 
    const predictedCO2_15Min = m * futureTime15Min + b;
    const finalPrediction = Math.max(0, Math.round(predictedCO2_15Min)); //0未満にならない
    
    const predictions = {};
    [5, 10, 15].forEach(minutes => {
        const futureTime = latestTime + (minutes * 60)
        const predictedCO2 = m * futureTime + b;
        predictions[minutes] = Math.max(0, Math.round(predictedCO2)); //0未満にならない
    });
    
    //閾値
    const THRESHOLD = 1500;
    
    if (finalPrediction >= THRESHOLD) {
        if (!hasSentPredictionNotification) {
            sendNotificationRequest();
            hasSentPredictionNotification = true; // フラグをONにする
        }
        console.warn(`警告: 15分後のCO2予測値 (${finalPrediction} ppm) が閾値 (${THRESHOLD} ppm) を超えました。`);

    } else if (hasSentPredictionNotification) {
        hasSentPredictionNotification = false;
        console.log("通知フラグをリセットしました。予測CO2値が安全圏に戻りました。");
    }
}

//グラフ関連
function renderCombinedChart(data) {
    const sortedData = [...data].reverse();
    
    const labels = sortedData.map(item => formatDate(new Date(item.time * 1000)).substring(11, 16)); // 時刻のみ
    const tempValues = sortedData.map(item => parseFloat(item.temp));
    const humidValues = sortedData.map(item => parseFloat(item.humid));
    
    //WBGT値計算
    const wbgtValues = sortedData.map(item => 
        approximateWBGT(parseFloat(item.temp), parseFloat(item.humid))
    );

    const ctx = document.getElementById('humidChart').getContext('2d');
    if (humidChartInstance) {
        humidChartInstance.destroy();
    }

    humidChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '温度 (°C)',
                    data: tempValues,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    yAxisID: 'yTemp',
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3
                },
                {
                    label: '湿度 (%)',
                    data: humidValues,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    yAxisID: 'yHumid',
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3
                },
                {
                    label: 'WBGT (°C) - 近似', 
                    data: wbgtValues,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    yAxisID: 'yTemp',
                    tension: 0.3,
                    borderWidth: 3,
                    pointRadius: 4,
                    borderDash: [8, 4],
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            stacked: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '時間'
                    }
                },
                yTemp: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: '温度 / WBGT (°C)'
                    },
                    suggestedMin: 15, 
                    suggestedMax: 35, 
                    afterBuildTicks: function(axis) {
                        axis.ticks.push({ value: 28, label: '28 (警戒ライン)' });
                    }
                },
                yHumid: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: '湿度 (%)'
                    },
                    beginAtZero: false,
                    min: 0, 
                    max: 100, 
                    grid: {
                        drawOnChartArea: false, 
                    },
                }
            }
        }
    });
}

//直近データテーブル
function renderTable(data) {
    tableBody.innerHTML = ''; 
    
    //最新20件に制限
    const displayData = data.slice(0, 20);
    
    //データは新しい順
    displayData.forEach(item => {
        const newRow = tableBody.insertRow();
        newRow.classList.add('hover:bg-gray-50'); 

        const date = new Date(item.time * 1000);
        newRow.insertCell().classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-900', 'font-mono');
        newRow.insertCell().classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500');
        newRow.insertCell().classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500'); 

        const co2Cell = newRow.insertCell();
        co2Cell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'font-medium');
        const co2 = parseInt(item.co2);
        if (co2 >= 950) {
             co2Cell.classList.add('text-red-600', 'font-bold');
        } else if (co2 >= 800) {
             co2Cell.classList.add('text-orange-500');
        } else {
             co2Cell.classList.add('text-gray-900');
        }
        
        newRow.insertCell().classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500');
        newRow.insertCell().classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500');

        newRow.cells[0].textContent = formatDate(date);
        newRow.cells[1].textContent = parseFloat(item.lat).toFixed(4);
        newRow.cells[2].textContent = parseFloat(item.lng).toFixed(4);
        co2Cell.textContent = item.co2;
        newRow.cells[4].textContent = parseFloat(item.temp).toFixed(1);
        newRow.cells[5].textContent = parseFloat(item.humid).toFixed(1);
    });
    
    statusElement.textContent = `データの読み込みが完了しました (${data.length}件中、最新${displayData.length}件を表示)。`;
}

//CO2グラフ描画
function renderCo2Chart(data) {
    const sortedData = [...data].reverse();
    const labels = sortedData.map(item => formatDate(new Date(item.time * 1000)).substring(11, 16)); // 時刻のみ
    const co2Values = sortedData.map(item => parseInt(item.co2));

    //予測値計算
    const timestamps = sortedData.map(item => item.time);
    const { m, b } = linearRegression(timestamps, co2Values);
    const latestTime = sortedData[sortedData.length - 1].time;
    
    const futureTimes = [5, 10, 15];
    const predictionPoints = [];
    const predictionLabels = [];
    
    predictionPoints.push({
        x: labels[labels.length - 1], 
        y: co2Values[co2Values.length - 1]
    });
    predictionLabels.push(labels[labels.length - 1]);
    
    futureTimes.forEach(minutes => {
        const futureTime = latestTime + (minutes * 60);
        const predictedCO2 = m * futureTime + b;
        const roundedPrediction = Math.max(0, Math.round(predictedCO2));
        
        const futureDate = new Date(futureTime * 1000);
        const timeLabel = formatDate(futureDate).substring(11, 16);
        
        predictionLabels.push(`+${minutes}min (${timeLabel})`);
        predictionPoints.push({
            x: `+${minutes}min (${timeLabel})`,
            y: roundedPrediction
        });
    });
    
    //予測を追加
    const fullLabels = labels.slice();
    futureTimes.forEach(minutes => {
        const futureTime = latestTime + (minutes * 60);
        const futureDate = new Date(futureTime * 1000);
        const timeLabel = formatDate(futureDate).substring(11, 16);
        fullLabels.push(`+${minutes}min (${timeLabel})`);
    });
    
    //チャート
    const ctx = document.getElementById('co2Chart').getContext('2d');
    if (co2ChartInstance) {
        co2ChartInstance.destroy();
    }

    co2ChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: fullLabels,
            datasets: [
                {
                    label: 'CO2濃度 (ppm) - 実測',
                    data: co2Values,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#ef4444',
                },
                {
                    label: 'CO2濃度 (ppm) - 予測',
                    // 実測値の終点から予測点へ線をつなげる
                    data: [
                        ...Array(co2Values.length - 1).fill(null),
                        co2Values[co2Values.length - 1],
                        predictionPoints[1].y,
                        predictionPoints[2].y,
                        predictionPoints[3].y,
                    ],
                    borderColor: '#f59e0b',
                    borderDash: [5, 5],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: (context) => {
                        const index = context.dataIndex;
                        return (index >= co2Values.length) ? 6 : 0; 
                    },
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: 'white',
                    pointHoverRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '時間'
                    },
                    grid: {
                         color: (context) => {
                             if (context.index >= co2Values.length) {
                                 return 'rgba(0, 0, 0, 0.05)';
                             }
                             return 'rgba(0, 0, 0, 0.1)';
                         }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'CO2 (ppm)'
                    },
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            if (value === 1000) return '1000';
                            if (value === 1500) return '1500';
                            return value;
                        }
                    },
                    suggestedMin: 600, 
                    suggestedMax: 1600
                }
            }
        }
    });
}

//温度湿度グラフ描画
function renderHumidChart(data) {
    const sortedData = [...data].reverse();
    
    const labels = sortedData.map(item => formatDate(new Date(item.time * 1000)).substring(11, 16)); // 時刻のみ
    const tempValues = sortedData.map(item => parseFloat(item.temp));
    const humidValues = sortedData.map(item => parseFloat(item.humid));
    
    //チャート
    const ctx = document.getElementById('humidChart').getContext('2d');
    if (humidChartInstance) {
        humidChartInstance.destroy();
    }

    humidChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '温度 (°C)',
                    data: tempValues,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    yAxisID: 'yTemp',
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3
                },
                {
                    label: '湿度 (%)',
                    data: humidValues,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    yAxisID: 'yHumid',
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            stacked: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '時間'
                    }
                },
                yTemp: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: '温度 (°C)'
                    },
                    suggestedMin: 15,
                    suggestedMax: 35,
                },
                yHumid: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: '湿度 (%)'
                    },
                    beginAtZero: false,
                    min: 0,
                    max: 100,
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            }
        }
    });
}


//更新処理
async function updateAll() {
    statusElement.textContent = '更新中...'; 
    
    //データを取得
    const newData = await fetchFromGas();
    
    if (newData && newData.length > 0) {
        renderIndicatorCards(newData); 
        renderTable(newData); 
        renderCo2Chart(newData);
        renderCombinedChart(newData);
        
        initMap(newData); 
    } else {
        if (statusElement.textContent === '更新中...') {
             statusElement.textContent = 'データの取得に失敗しました。以前のデータを表示しています。';
        } else if (statusElement.textContent.startsWith('データの読み込みが完了しました')) {
             //前の成功メッセージを維持
        } else {
             statusElement.textContent = 'データがありません。';
        }
    }
}

updateAll(); 

setInterval(updateAll, 5000);