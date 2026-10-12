const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の暦日 YYYY-MM-DD（epoch は UTC ミリ秒） */
export function formatJapanCalendarDate(epochMs: number): string {
  const jst = new Date(epochMs + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 画面表示用 YYYY年M月D日 */
export function formatJapanDisplayDate(calendarYmd: string): string {
  const [y, m, d] = calendarYmd.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 保存形式 YYYY-MM-DD の翌月末 */
export function nextMonthEndYmd(issueYmd: string): string {
  const [y, m] = issueYmd.split('-').map(Number);
  let year = y;
  let month = m + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const lastDay = lastDayOfMonth(year, month);
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function todayJapanYmd(nowMs = Date.now()): string {
  return formatJapanCalendarDate(nowMs);
}
