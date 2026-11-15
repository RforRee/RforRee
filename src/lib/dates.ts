/** Normalize to a UTC date-only value (time 00:00:00.000Z), or null. */
export function toDateOnly(
  value: string | Date | null | undefined,
): Date | null {
  if (value == null || value === "") return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${String(value)}`);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
