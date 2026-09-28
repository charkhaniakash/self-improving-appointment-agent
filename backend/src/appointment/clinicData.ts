import type { Doctor } from "../types/appointment.js";

export const DOCTORS: Doctor[] = [
  { id: "dr_sharma", name: "Dr. Sharma", specialty: "General Physician" },
  { id: "dr_patel", name: "Dr. Patel", specialty: "Cardiologist" },
  { id: "dr_khan", name: "Dr. Khan", specialty: "Dermatologist" },
];

/**
 * Base availability: keyed by doctorId -> set of "YYYY-MM-DD HH:mm".
 * A slot is bookable only if listed here AND not already taken by an
 * existing (non-cancelled) appointment.
 */
export const AVAILABILITY: Record<string, string[]> = {
  dr_sharma: [
    "2026-09-29 09:00",
    "2026-09-29 10:00",
    "2026-09-29 14:00",
    "2026-09-30 10:00",
    "2026-09-30 11:00",
  ],
  dr_patel: [
    "2026-09-29 11:00",
    "2026-09-30 15:00",
  ],
  dr_khan: [
    // intentionally sparse — used for "doctor unavailable" scenarios
    "2026-10-05 16:00",
  ],
};

export function findDoctorByNameOrId(query: string): Doctor | undefined {
  const q = query.toLowerCase().trim();
  return DOCTORS.find(
    (d) =>
      d.id.toLowerCase() === q ||
      d.name.toLowerCase() === q ||
      d.name.toLowerCase().includes(q) ||
      q.includes(d.name.toLowerCase().replace("dr. ", "")),
  );
}
