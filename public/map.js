let currentMap = null; 

let markerLayer = null; 

//地図表示機能の追加
function initMap(data) {
    if (!data || data.length === 0) {
        //データクリア
        if (currentMap !== null) currentMap.remove();
        currentMap = null;
        markerLayer = null;
        return;
    }

    //地図初期化
    if (currentMap === null) {
        //地図の中心はインデックス0
        if(!data[0].lat){
            data[0].lat = 35.636699;
            data[0].lng = 139.73081;
        }
        const firstPoint = { 
            lat: parseFloat(data[0].lat), 
            lng: parseFloat(data[0].lng) 
        };

        currentMap = L.map('map').setView([firstPoint.lat, firstPoint.lng], 15); 

        //タイルレイヤー
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(currentMap);

        //マーカーレイヤー
        markerLayer = L.featureGroup().addTo(currentMap);
    } else {
        //古いマーカー
        if (markerLayer) {
            markerLayer.clearLayers();
        } else {
            markerLayer = L.featureGroup().addTo(currentMap);
        }
    }

    //マーカー設置
    data.forEach(point => {
        const lat = parseFloat(point.lat);
        const lng = parseFloat(point.lng);
        
        if (isNaN(lat) || isNaN(lng)) return;

        //マーカー色変更
        const co2 = parseInt(point.co2);
        let color = 'blue';
        if (co2 >= 1500) {
            color = 'red';
        } else if (co2 >= 1000) {
            color = 'orange';
        }

        // カスタムアイコン
        const co2Icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${color}; color: white; border-radius: 50%; width: 20px; height: 20px; line-height: 20px; text-align: center; border: 2px solid white; font-size: 10px;">${co2}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        L.marker([lat, lng], { icon: co2Icon })
            .addTo(markerLayer)
            .bindPopup(`
                <strong>CO2: ${co2} ppm</strong><br>
                Time: ${formatDate(new Date(point.time * 1000))}
            `);
    });
    
    if (currentMap) {
        currentMap.invalidateSize();
    }
}