/**
 * 日期格式化工具（統一使用 Asia/Taipei 時區）
 */

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
}

/**
 * 取得台北時區的今天日期（YYYY-MM-DD 格式）
 */
export function getTaipeiToday() {
  const d = new Date();
  const parts = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }).split('-');
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

/**
 * 取得台北時區的當月第一天（YYYY-MM-DD 格式）
 */
export function getTaipeiMonthStart() {
  const d = new Date();
  const parts = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }).split('-');
  return `${parts[0]}-${parts[1]}-01`;
}
