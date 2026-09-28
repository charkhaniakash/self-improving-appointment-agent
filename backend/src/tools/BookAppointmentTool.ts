import { z } from "zod";
import type { Tool, ToolResult } from "../types/tool.js";
import type { AppointmentRepository } from "../appointment/AppointmentRepository.js";
import {
  AVAILABILITY,
  findDoctorByNameOrId,
} from "../appointment/clinicData.js";
import type { Appointment } from "../types/appointment.js";

const inputSchema = z.object({
  patientName: z.string().min(1),
  doctor: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});
type Input = z.infer<typeof inputSchema>;

export class BookAppointmentTool implements Tool<Input, Appointment> {
  readonly schema = {
    name: "book_appointment",
    description:
      "Book a confirmed appointment for a patient. Fails if the doctor does not offer that slot, the slot is already taken, or the patient already has a booking at that time.",
    parameters: {
      type: "object",
      properties: {
        patientName: { type: "string", description: "Patient's full name" },
        doctor: { type: "string", description: "Doctor name or id" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:mm 24h" },
      },
      required: ["patientName", "doctor", "date", "time"],
    },
  };
  readonly inputSchema = inputSchema;

  constructor(private readonly repo: AppointmentRepository) {}

  async execute(input: Input): Promise<ToolResult<Appointment>> {
    const doctor = findDoctorByNameOrId(input.doctor);
    if (!doctor) return { ok: false, error: `Unknown doctor: ${input.doctor}` };

    const slotKey = `${input.date} ${input.time}`;
    const offered = (AVAILABILITY[doctor.id] ?? []).includes(slotKey);
    if (!offered) {
      return {
        ok: false,
        error: `${doctor.name} does not offer a slot at ${input.date} ${input.time}.`,
      };
    }
    if (this.repo.isSlotTaken(doctor.id, input.date, input.time)) {
      return {
        ok: false,
        error: `That slot with ${doctor.name} is already taken.`,
      };
    }
    if (this.repo.hasConflict(input.patientName, input.date, input.time)) {
      return {
        ok: false,
        error: `${input.patientName} already has an appointment at ${input.date} ${input.time}.`,
      };
    }
    const appt = this.repo.create({
      patientName: input.patientName,
      doctorId: doctor.id,
      date: input.date,
      time: input.time,
    });
    return { ok: true, data: appt };
  }
}
