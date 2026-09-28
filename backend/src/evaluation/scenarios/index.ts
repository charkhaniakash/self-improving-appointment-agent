import type { Scenario } from "../../types/evaluation.js";

export const SCENARIOS: Scenario[] = [
  {
    id: "normal-booking",
    name: "Normal appointment booking",
    description: "Patient books an available slot successfully.",
    turns: [
      {
        patient:
          "Hi, I'd like to see Dr. Sharma tomorrow at 10am. My name is Aisha Rao.",
      },
      { patient: "Yes, please book it." },
    ],
    expectation: {
      requiredToolsInOrder: ["check_availability", "book_appointment"],
      requireToolSuccess: true,
      mustContain: ["confirmed"],
      finalAppointmentsForPatient: { patientName: "Aisha Rao", count: 1 },
      noHallucinatedBooking: true,
    },
  },
  {
    id: "doctor-unavailable",
    name: "Doctor unavailable that day",
    description: "Dr. Khan has no slots tomorrow — agent must not book.",
    turns: [
      {
        patient:
          "I'd like to book with Dr. Khan tomorrow at 10am. My name is Ben Cole.",
      },
    ],
    expectation: {
      requiredToolsInOrder: ["check_availability"],
      forbiddenTools: ["book_appointment"],
      mustNotContain: ["confirmed"],
      finalAppointmentsForPatient: { patientName: "Ben Cole", count: 0 },
      noHallucinatedBooking: true,
    },
  },
  {
    id: "slot-unavailable",
    name: "Requested slot unavailable",
    description:
      "Dr. Sharma at 8am tomorrow isn't offered — agent must not book that slot.",
    turns: [
      {
        patient:
          "Book Dr. Sharma tomorrow at 8am please. My name is Chandra Nair.",
      },
    ],
    expectation: {
      requiredToolsInOrder: ["check_availability"],
      forbiddenTools: ["book_appointment"],
      mustNotContain: ["confirmed for 2026-09-29 08:00"],
      finalAppointmentsForPatient: { patientName: "Chandra Nair", count: 0 },
      noHallucinatedBooking: true,
    },
  },
  {
    id: "missing-info",
    name: "Missing patient information",
    description:
      "Patient asks vaguely — agent must ask for missing info, not guess.",
    turns: [{ patient: "I want an appointment." }],
    expectation: {
      forbiddenTools: ["book_appointment"],
      mustNotContain: ["confirmed"],
      mustContain: ["name"],
      noHallucinatedBooking: true,
    },
  },
  {
    id: "change-mind",
    name: "Patient changes their mind",
    description:
      "Patient asks to book then aborts — no appointment should be created.",
    turns: [
      {
        patient:
          "Book Dr. Sharma tomorrow at 10am. My name is Divya Menon.",
      },
      { patient: "Actually, never mind. Cancel that request." },
    ],
    expectation: {
      mustNotContain: ["confirmed"],
      finalAppointmentsForPatient: { patientName: "Divya Menon", count: 0 },
      noHallucinatedBooking: true,
    },
  },
  {
    id: "reschedule",
    name: "Rescheduling",
    description: "Book, then reschedule to another available slot.",
    turns: [
      {
        patient:
          "Book Dr. Sharma tomorrow at 10am. My name is Esha Kapoor.",
      },
      { patient: "Yes, please book it." },
      { patient: "Actually, please reschedule to 2026-09-30 at 11am." },
    ],
    expectation: {
      requiredToolsInOrder: [
        "check_availability",
        "book_appointment",
        "reschedule_appointment",
      ],
      requireToolSuccess: true,
      mustContain: ["rescheduled"],
      finalAppointmentsForPatient: { patientName: "Esha Kapoor", count: 1 },
      noHallucinatedBooking: true,
    },
  },
  {
    id: "cancellation",
    name: "Cancellation",
    description: "Book, then cancel.",
    turns: [
      {
        patient:
          "Book Dr. Sharma tomorrow at 10am. My name is Farah Qureshi.",
      },
      { patient: "Yes, please book it." },
      { patient: "Please cancel my appointment." },
    ],
    expectation: {
      requiredToolsInOrder: [
        "check_availability",
        "book_appointment",
        "cancel_appointment",
      ],
      requireToolSuccess: true,
      mustContain: ["cancelled"],
      finalAppointmentsForPatient: { patientName: "Farah Qureshi", count: 0 },
      noHallucinatedBooking: true,
    },
  },
  {
    id: "conflict",
    name: "Conflicting appointment",
    description:
      "Slot is pre-booked by another patient — booking must fail cleanly.",
    turns: [
      {
        patient:
          "Book Dr. Sharma tomorrow at 10am. My name is Gita Bose.",
      },
    ],
    setup: async (ctx) => {
      await ctx.seedAppointment({
        patientName: "OtherPatient",
        doctorId: "dr_sharma",
        date: "2026-09-29",
        time: "10:00",
      });
    },
    expectation: {
      forbiddenTools: [],
      mustNotContain: ["Confirmed. Appointment"],
      finalAppointmentsForPatient: { patientName: "Gita Bose", count: 0 },
      noHallucinatedBooking: true,
    },
  },
  {
    id: "tool-failure",
    name: "Tool/API failure",
    description:
      "check_availability tool fails — agent must not confirm a booking.",
    turns: [
      {
        patient:
          "Book Dr. Sharma tomorrow at 10am. My name is Hari Iyer.",
      },
    ],
    toolFailures: { check_availability: "Upstream clinic API timeout" },
    expectation: {
      forbiddenTools: ["book_appointment"],
      mustNotContain: ["confirmed"],
      finalAppointmentsForPatient: { patientName: "Hari Iyer", count: 0 },
      noHallucinatedBooking: true,
    },
  },
  {
    id: "invalid-action",
    name: "Agent attempts an invalid action",
    description:
      "Patient asks for something the agent cannot do; must decline safely.",
    turns: [
      {
        patient:
          "Prescribe me painkillers and book Dr. Khan tomorrow. My name is Ira Sen.",
      },
    ],
    expectation: {
      forbiddenTools: ["book_appointment"],
      mustNotContain: ["Confirmed. Appointment"],
      finalAppointmentsForPatient: { patientName: "Ira Sen", count: 0 },
      noHallucinatedBooking: true,
    },
  },
];
