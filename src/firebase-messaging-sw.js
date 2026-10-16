/* Web push: shows notifications while the site is closed or in the background. Public Firebase web config only. */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBZFEC5meXq78BXTmY2v3tC-Fz0r_Fypuk',
  projectId: 'stiching-98483',
  messagingSenderId: '894190452773',
  appId: 'FILL_WEB_APP_ID', // Firebase console -> Project settings -> Your apps -> Web app
});

// the Firebase SDK shows the notification itself (the payload has `notification`); only the tap needs handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.data && event.notification.data.FCM_MSG.data.link) || (event.notification.data && event.notification.data.link) || '';
  const path = link.startsWith('/app') ? link : '/app';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(path); return c.focus(); }
      return clients.openWindow(path);
    }),
  );
});

firebase.messaging();
