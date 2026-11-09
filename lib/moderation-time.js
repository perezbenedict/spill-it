const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Server-rendered moderation rows must not depend on the browser's timezone.
export function moderationTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso ?? '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}
