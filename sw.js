self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : { title: 'BCN FITNESS', body: '¡Es hora de entrenar!' };
    
    const options = {
        body: data.body,
        icon: 'logo.png',
        badge: 'logo.png',
        vibrate: [300, 100, 300, 100, 400],
        tag: 'workout-alert',
        renotify: true,
        data: { url: self.registration.scope },
        actions: [
            { action: 'open', title: 'Ver App' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
