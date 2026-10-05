import { test } from "node:test";
import assert from "node:assert/strict";
import { isCalendarDate, supportedDate } from "../shared/dates";
test("Calendar validation rejects nonexistent dates and permits leap days", () => {
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(isCalendarDate("2026-04-31"), false);
  assert.equal(isCalendarDate("2028-02-29"), true);
});
test("Quotation must support the day, month and year, not merely the year", () => {
  assert.equal(
    supportedDate("2026-11-09", "Return the form by 5 November 2026."),
    null,
  );
  assert.equal(
    supportedDate("2026-12-05", "Return the form by 5 November 2026."),
    null,
  );
  assert.equal(
    supportedDate("2026-11-05", "Return the form by 5 November 2026."),
    "2026-11-05",
  );
  assert.equal(
    supportedDate("2026-11-05", "Return the form by 15 November 2026."),
    null,
  );
  assert.equal(
    supportedDate("2026-11-05", "Return it by November 5th, 2026."),
    "2026-11-05",
  );
  assert.equal(
    supportedDate("2026-12-10", "Entro il 10 dicembre 2026."),
    "2026-12-10",
  );
});
test("Ambiguous numeric and relative dates stay unresolved", () => {
  assert.equal(supportedDate("2026-05-04", "Due 04/05/2026."), null);
  assert.equal(supportedDate("2026-04-05", "Due 04/05/2026."), null);
  assert.equal(supportedDate("2026-12-14", "Due 14/12/2026."), "2026-12-14");
  assert.equal(supportedDate("2026-12-14", "Due 12/14/2026."), "2026-12-14");
  assert.equal(supportedDate("2026-12-14", "Due 2026-12-14."), "2026-12-14");
  assert.equal(supportedDate("2026-12-14", "Next Friday. Notice 2026."), null);
  assert.equal(supportedDate("2026-11-05", "Due 5 November."), null);
});
