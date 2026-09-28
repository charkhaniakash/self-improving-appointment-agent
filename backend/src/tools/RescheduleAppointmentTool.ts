import { z } from "zod";
import type { Tool, ToolResult } from "../types/tool.js";
import type { AppointmentRepository } from "../appointment/AppointmentRepository.js";
import {
  AVAILABILITY,
  findDoctorByNameOrId,
} from "../appointment/clinicData.js";
import type { Appointment } from "../types/appointment.js";

const inputSchema = z.object({
  appointmentId: z.string().optional(),
  patientName: z.string().optional(),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newTime: z.string().regex(/^\d{2}:\d{2}$/),
});
type Input = z.infer<typeof inputSchema>;

export class RescheduleAppointmentTool implements Tool<Input, Appointment> {
  readonly schema = {
    name: "reschedule_appointment",
    description:
      "Reschedule an existing appointment to a new date/time. New slot must be offered by the same doctor and free.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        patientName: { type: "string" },
        newDate: { type: "string", description: "YYYY-MM-DD" },
        newTime: { type: "string", description: "HH:mm" },
      },
      required: ["newDate", "newTime"],
    },
  };
  readonly inputSchema = inputSchema;

  constructor(private readonly repo: AppointmentRepository) {}

  async execute(input: Input): Promise<ToolResult<Appointment>> {
    let id = input.appointmentId;
    if (!id && input.patientName) {
      const active = this.repo.findByPatient(input.patientName);
      if (active.length === 0)
        return {
          ok: false,
          error: `No active appointment for ${input.patientName}.`,
        };
      if (active.length > 1)
        return {
          ok: false,
          error: `${input.patientName} has multiple active appointments; specify appointmentId.`,
        };
      id = active[0].id;
    }
    if (!id) return { ok: false, error: "appointmentId required" };
    const appt = this.repo.findById(id);
    if (!appt) return { ok: false, error: `No appointment with id ${id}.` };
    if (appt.status === "cancelled")
      return { ok: false, error: "Cannot reschedule a cancelled appointment." };

    const slotKey = `${input.newDate} ${input.newTime}`;
    const doctorSlots = AVAILABILITY[appt.doctorId] ?? [];
    if (!doctorSlots.includes(slotKey)) {
      const doctor = findDoctorByNameOrId(appt.doctorId);
      return {
        ok: false,
        error: `${doctor?.name ?? appt.doctorId} does not offer ${input.newDate} ${input.newTime}.`,
      };
    }
    if (this.repo.isSlotTaken(appt.doctorId, input.newDate, input.newTime)) {
      return { ok: false, error: `That slot is already taken.` };
    }
    const updated = this.repo.reschedule(id, input.newDate, input.newTime)!;
    return { ok: true, data: updated };
  }
}
