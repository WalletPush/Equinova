// Service Worker for Push Notifications
self.addEventListener('push', function(event) {
  console.log('Push event received:', event);

  let notificationData = {
    title: 'EquiNova Racing Alert',
    body: 'New racing insight available',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: {},
    actions: [
      { action: 'view', title: 'View Details', icon: '/favicon.ico' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = {
        ...notificationData,
        ...pushData
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
    }
  }

  const promiseChain = self.registration.showNotification(
    notificationData.title,
    {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      actions: notificationData.actions,
      requireInteraction: notificationData.requireInteraction || false,
      tag: notificationData.tag || 'racing-alert',
      timestamp: Date.now()
    }
  );

  event.waitUntil(promiseChain);
});

self.addEventListener('notificationclick', function(event) {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data;

  if (action === 'dismiss') {
    return; // Just close the notification
  }

  // Handle notification clicks
  const urlToOpen = action === 'view_race' && notificationData?.race_id 
    ? `/race/${notificationData.race_id}`
    : '/ai-insider';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('install', function(event) {
  console.log('Service Worker installing');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
  console.log('Service Worker activating');
  event.waitUntil(self.clients.claim());
});