import type { Analysis, Fact } from "./schema";
const fact = (text: string, quote: string, detail = ""): Fact => ({
  text,
  detail,
  citation: { quote, page: 1 },
});
const form =
  "To renew, members must return the signed renewal form to the centre office by 5 November 2026.";
const pay =
  "The renewal fee is EUR 28, payable through the centre booking portal by 9 November 2026.";
const receipt =
  "Members who renew must keep a copy of their payment confirmation.";
const booking =
  "Residents who would like an appointment must book through the Appointments section of the community portal by 23 November 2026.";
const missing =
  "To sign up, hand in the form in Attachment A to the centre office by next Friday.";
const renewal = `EXAMPLE NOTICE — SAMPLE CONTENT
Riverside Community Centre — Notice 24
Subject: Membership renewal
To current Riverside Community Centre members.
The new membership period begins on 18 November 2026.
${form}
${pay} The fee includes access to the centre during the new membership period.
${receipt}
Renewal is optional. Members who do not renew will lose access when their current membership expires.`;
const appointments = `EXAMPLE NOTICE — SAMPLE CONTENT
Riverside Community Centre — Notice 31
Subject: Community advice appointments
To all residents registered with the community centre.
Individual advice appointments will take place on 26 November 2026, from 15:00 to 18:00, in person at the community centre.
${booking}
Each appointment will last 10 minutes. Booking is subject to time-slot availability.
For help accessing the portal, contact the centre office at office@example.org.`;
const incomplete = `EXAMPLE NOTICE — SAMPLE CONTENT
Riverside Community Centre — Notice 38
Subject: Community robotics workshop
To residents of Oak Street and their families.
A community robotics workshop is planned. The timetable will be announced later.
${missing}
The workshop will run only if at least 15 people sign up.
Information about the participation fee will be published later.`;
export const examples: {
  id: string;
  title: string;
  category: string;
  description: string;
  text: string;
  analysis: Analysis;
}[] = [
  {
    id: "gita",
    title: "A payment, with clear next steps",
    category: "PAYMENTS & FORMS",
    description:
      "A renewal form, a fee and a start date. Know what to do first.",
    text: renewal,
    analysis: {
      title: "Community centre membership renewal",
      summary: [
        fact(
          "The new membership period starts on 18 November 2026.",
          "The new membership period begins on 18 November 2026.",
        ),
        fact(
          "Renewing is optional. If you do not renew, access ends when your current membership expires.",
          "Renewal is optional. Members who do not renew will lose access when their current membership expires.",
        ),
      ],
      recipients: [
        fact(
          "Current Riverside Community Centre members.",
          "To current Riverside Community Centre members.",
        ),
      ],
      actions: [
        {
          ...fact("Return the signed renewal form", form),
          who: "Members who want to renew",
          deadline: "5 November 2026",
          prerequisites: "Signed renewal form; return it to the centre office",
          optional: false,
        },
        {
          ...fact("Pay the EUR 28 renewal fee", pay),
          who: "Members who want to renew",
          deadline: "9 November 2026",
          prerequisites: "Access to the centre booking portal",
          optional: false,
        },
        {
          ...fact("Keep your payment confirmation", receipt),
          who: "Members who renew",
          deadline: "Not specified",
          prerequisites: "A copy of the payment confirmation",
          optional: false,
        },
      ],
      dates: [
        {
          ...fact("Renewal form due", form, "5 November 2026"),
          kind: "deadline",
          iso: "2026-11-05",
        },
        {
          ...fact("Payment due", pay, "9 November 2026"),
          kind: "deadline",
          iso: "2026-11-09",
        },
        {
          ...fact(
            "New membership period begins",
            "The new membership period begins on 18 November 2026.",
            "18 November 2026",
          ),
          kind: "event",
          iso: "2026-11-18",
        },
      ],
      costs: [
        fact(
          "EUR 28 through the centre booking portal",
          pay +
            " The fee includes access to the centre during the new membership period.",
          "Access during the new membership period is included.",
        ),
        fact("Signed renewal form", form),
        fact("A copy of your payment confirmation", receipt),
      ],
      questions: [],
    },
  },
  {
    id: "incontro",
    title: "An appointment, made simple",
    category: "APPOINTMENTS",
    description: "Check who can attend, how to book and when it takes place.",
    text: appointments,
    analysis: {
      title: "Community advice appointments",
      summary: [
        fact(
          "In-person advice appointments on 26 November 2026, from 15:00 to 18:00.",
          "Individual advice appointments will take place on 26 November 2026, from 15:00 to 18:00, in person at the community centre.",
        ),
        fact(
          "Each appointment lasts 10 minutes. Time slots are subject to availability.",
          "Each appointment will last 10 minutes. Booking is subject to time-slot availability.",
        ),
      ],
      recipients: [
        fact(
          "All residents registered with the community centre.",
          "To all residents registered with the community centre.",
        ),
      ],
      actions: [
        {
          ...fact("Book a time slot in the community portal", booking),
          who: "Residents who want an appointment",
          deadline: "23 November 2026",
          prerequisites: "Access to the community portal, Appointments section",
          optional: true,
        },
      ],
      dates: [
        {
          ...fact("Booking closes", booking, "23 November 2026"),
          kind: "deadline",
          iso: "2026-11-23",
        },
        {
          ...fact(
            "In-person advice appointments",
            "Individual advice appointments will take place on 26 November 2026, from 15:00 to 18:00, in person at the community centre.",
            "26 November 2026 · 15:00–18:00",
          ),
          kind: "event",
          iso: "2026-11-26",
        },
      ],
      costs: [],
      questions: [],
    },
  },
  {
    id: "incompleta",
    title: "When details are missing",
    category: "INCOMPLETE NOTICE",
    description:
      "A missing attachment and “next Friday”. See what needs checking.",
    text: incomplete,
    analysis: {
      title: "Community robotics workshop",
      summary: [
        fact(
          "A community robotics workshop is planned. The timetable is not available yet.",
          "A community robotics workshop is planned. The timetable will be announced later.",
        ),
        fact(
          "The workshop will run only if at least 15 people sign up.",
          "The workshop will run only if at least 15 people sign up.",
        ),
      ],
      recipients: [
        fact(
          "Residents of Oak Street and their families.",
          "To residents of Oak Street and their families.",
        ),
      ],
      actions: [
        {
          ...fact(
            "Hand in the sign-up form after checking the deadline",
            missing,
          ),
          who: "People who want to sign up",
          deadline: "“Next Friday” — date needs clarification",
          prerequisites: "Attachment A, not included in this document",
          optional: true,
        },
      ],
      dates: [
        {
          ...fact(
            "Sign-up deadline needs clarification",
            missing,
            "Next Friday · no reference date given",
          ),
          kind: "unclear",
          iso: null,
        },
      ],
      costs: [],
      questions: [
        fact(
          "Attachment A is missing",
          missing,
          "The notice refers to a form that has not been uploaded.",
        ),
        fact(
          "The deadline cannot be determined",
          missing,
          "“Next Friday” has no clear reference date.",
        ),
        fact(
          "The fee is not specified",
          "Information about the participation fee will be published later.",
        ),
        fact(
          "The timetable is not available",
          "The timetable will be announced later.",
        ),
      ],
    },
  },
];
