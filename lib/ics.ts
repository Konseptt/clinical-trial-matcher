/**
 * Minimal RFC 5545 iCalendar builder for eligibility reminders.
 *
 * Produces all-day VEVENTs (one per projected eligibility date) with a 7-day
 * advance alarm, so a patient or coordinator is reminded to re-check a trial
 * when a washout window is expected to clear. Output is plain text the browser
 * can download as a .ics file. No network, no PHI leaves the device.
 */

export interface CalendarEvent {
  /** Stable unique id (within this calendar). */
  uid: string;
  /** All-day date, ISO yyyy-mm-dd. */
  date: string;
  title: string;
  description?: string;
  url?: string;
}

// Escape per RFC 5545 §3.3.11 (TEXT): backslash, semicolon, comma, newlines.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toIcsDate(isoDate: string): string {
  return isoDate.replace(/-/g, "").slice(0, 8);
}

function addDaysCompact(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcsCalendar(
  events: CalendarEvent[],
  options: { calendarName?: string; now?: Date } = {}
): string {
  const now = options.now ?? new Date();
  const dtstamp = stamp(now);
  const calName = options.calendarName ?? "Clinical Trial Eligibility";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clinical Trial Matcher//Eligibility Forecast//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];

  for (const event of events) {
    const start = toIcsDate(event.date);
    const end = addDaysCompact(event.date, 1); // DTEND is exclusive for all-day
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeText(event.title)}`
    );
    const descriptionParts = [event.description, event.url].filter(Boolean) as string[];
    if (descriptionParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeText(descriptionParts.join("\n"))}`);
    }
    if (event.url) {
      lines.push(`URL:${escapeText(event.url)}`);
    }
    lines.push(
      "BEGIN:VALARM",
      "TRIGGER:-P7D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Reminder: ${event.title}`)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 requires CRLF line breaks.
  return lines.join("\r\n");
}
