import { describe, it, expect } from "vitest";
import { buildIcsCalendar } from "@/lib/ics";

const NOW = new Date("2026-06-24T12:00:00Z");

describe("buildIcsCalendar", () => {
  it("wraps events in a valid VCALENDAR with CRLF line breaks", () => {
    const ics = buildIcsCalendar(
      [{ uid: "a@ctm", date: "2026-08-30", title: "Re-check NCT1" }],
      { now: NOW }
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("\r\n");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it("emits all-day dates with an exclusive end date", () => {
    const ics = buildIcsCalendar(
      [{ uid: "a@ctm", date: "2026-08-30", title: "Re-check NCT1" }],
      { now: NOW }
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260830");
    expect(ics).toContain("DTEND;VALUE=DATE:20260831");
  });

  it("adds a 7-day advance display alarm", () => {
    const ics = buildIcsCalendar(
      [{ uid: "a@ctm", date: "2026-08-30", title: "Re-check NCT1" }],
      { now: NOW }
    );
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-P7D");
  });

  it("escapes commas and semicolons in text fields", () => {
    const ics = buildIcsCalendar(
      [
        {
          uid: "a@ctm",
          date: "2026-08-30",
          title: "Re-check trial: chemo, washout",
          description: "Phase 2; HER2 positive",
        },
      ],
      { now: NOW }
    );
    expect(ics).toContain("SUMMARY:Re-check trial: chemo\\, washout");
    expect(ics).toContain("DESCRIPTION:Phase 2\\; HER2 positive");
  });

  it("produces a valid empty calendar when there are no events", () => {
    const ics = buildIcsCalendar([], { now: NOW });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
