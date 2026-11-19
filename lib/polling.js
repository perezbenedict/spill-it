export const ADMIN_LOW_BANDWIDTH_KEY = 'spill-admin-low-bandwidth';

export function refreshDelay(normal, { admin = false, dataSaver = false } = {}) {
  if (typeof window === 'undefined') return normal;
  let adminMode = document.documentElement.dataset.adminLowBandwidth === 'true';
  try { adminMode ||= localStorage.getItem(ADMIN_LOW_BANDWIDTH_KEY) === 'true'; } catch { /* This visit's setting still works. */ }
  return (admin && adminMode) || (dataSaver && navigator.connection?.saveData) ? 15000 : normal;
}

export function canRefresh() {
  return !document.hidden && navigator.onLine !== false;
}
