export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function number(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value)
  );
}
