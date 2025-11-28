const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json()); 

const vapidKeys = webpush.generateVAPIDKeys();
const VAPID_PUBLIC_KEY = "BLy5LQkDe6XwaUvqqA-EywANsjQZkmPnXaeZETtlpVmq_4i6ZtLIKhEBc55KN-CPjjwRYelPBk89oyuCdcyR1WE";
const VAPID_PRIVATE_KEY = "qNZU3ughQE_GlH37rmliyaWM35_jwyzig-FZ2HMj1FA";

webpush.setVapidDetails(
    'mailto:test@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

let subscriptions = []; 

app.get('/vapidPublicKey', (req, res) => {
    res.send(VAPID_PUBLIC_KEY);
});

app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    subscriptions.push(subscription);
    console.log('新しい購読情報を保存:', subscription);
    res.status(201).json({ message: 'Subscription saved' });
});

app.post('/sendNotification', (req, res) => {
    const payload = JSON.stringify({ 
        title: '車内環境監視システムからの通知', 
        body: 'CO2濃度が閾値を越しました．５分以内の空気の入れ替えを推奨します．これが不審な変化である場合，デバイスに警告ブザーを送信できます．',
        time: new Date().toLocaleTimeString('ja-JP')
    });

    subscriptions.forEach(subscription => {
        webpush.sendNotification(subscription, payload).catch(error => {
            console.error('通知送信エラー:', error.stack);
        });
    });

    res.status(202).json({ message: 'Notifications sent' });
});


app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`VAPID Public Key: ${VAPID_PUBLIC_KEY}`);
});