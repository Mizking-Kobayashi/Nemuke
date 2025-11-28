self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: '注意: 車内環境の変化', body: '計測データが更新されました。' };

    const options = {
        body: data.body,
        icon: '',
        data: {
            url: '/',
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow(event.notification.data.url) 
    );
});