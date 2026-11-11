export function safeTarget(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 300 ||
    /[\\%?#\s]/.test(value) ||
    value.startsWith('//')
  )
    return '/activities';
  const id = '[a-zA-Z0-9_-]{1,64}';
  const patterns = [
    /^\/activities$/,
    new RegExp(`^/activities/${id}(?:/register|/sessions/${id}/attendance)?$`),
    /^\/my(?:\/activities|\/insurance|\/participation)?$/,
    new RegExp(`^/managed/activities(?:/${id}/(?:registrations|onsite(?:/people)?))?$`),
  ];
  return patterns.some((p) => p.test(value)) ? value : '/activities';
}
