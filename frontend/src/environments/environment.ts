export const environment = {
  production: false,
  apiUrl: '/api',
  /** Default ISO currency code; the school can override it with the public setting "currency". */
  currency: 'PKR',
  // PWA service worker is only registered in production builds.
  enableServiceWorker: false,
};