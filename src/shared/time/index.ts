export function beijing(value: string, withDate = true) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        ...(withDate ? { month: 'long', day: 'numeric' } : {}),
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date)
    : '待确认';
}
export function decimal(value: string | null, unit: string) {
  return value === null ? '待认定' : `${value} ${unit}`;
}
