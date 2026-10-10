const TND_MILLS_PATTERN = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
const PERCENT_HUNDREDTHS_PATTERN = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/;

export function parseTndMills(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value);
  if (!TND_MILLS_PATTERN.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
}

export function parsePercentHundredths(value: string): bigint | null {
  if (!PERCENT_HUNDREDTHS_PATTERN.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const hundredths = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return hundredths <= BigInt(10000) ? hundredths : null;
}

export function discountTndMills(subtotalMills: bigint, percentHundredths: bigint): bigint {
  return (subtotalMills * percentHundredths + BigInt(5000)) / BigInt(10000);
}

export function tndMillsToDecimal(value: bigint): string {
  const isNegative = value < BigInt(0);
  const absolute = isNegative ? -value : value;
  const whole = absolute / BigInt(1000);
  const fraction = (absolute % BigInt(1000)).toString().padStart(3, "0");
  return `${isNegative ? "-" : ""}${whole}.${fraction}`;
}

export function formatTndMills(value: bigint, locale: "fr" | "ar"): string {
  const isNegative = value < BigInt(0);
  const absolute = isNegative ? -value : value;
  const whole = absolute / BigInt(1000);
  const fraction = (absolute % BigInt(1000)).toString().padStart(3, "0");
  const intlLocale = locale === "ar" ? "ar-TN" : "fr-TN";
  const integer = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }).format(whole);
  const decimal = new Intl.NumberFormat(intlLocale).formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value ?? ".";
  const digitFormatter = new Intl.NumberFormat(intlLocale, { useGrouping: false, maximumFractionDigits: 0 });
  const localizedFraction = Array.from(fraction, (digit) => digitFormatter.format(Number(digit))).join("");
  const minus = isNegative ? new Intl.NumberFormat(intlLocale).formatToParts(-1)
    .find((part) => part.type === "minusSign")?.value ?? "-" : "";
  return `${minus}${integer}${decimal}${localizedFraction}${locale === "ar" ? " د.ت" : " TND"}`;
}
