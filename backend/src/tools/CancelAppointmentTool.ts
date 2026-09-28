import { z } from "zod";
import type { Tool, ToolResult } from "../types/tool.js";
import type { AppointmentRepository } from "../appointment/AppointmentRepository.js";
import type { Appointment } from "../types/appointment.js";

const inputSchema = z
  .object({
    appointmentId: z.string().optional(),
    patientName: z.string().optional(),
  })
  .refine((v) => v.appointmentId || v.patientName, {
    message: "appointmentId or patientName required",
  });
type Input = z.infer<typeof inputSchema>;

export class CancelAppointmentTool implements Tool<Input, Appointment> {
  readonly schema = {
    name: "cancel_appointment",
    description:
      "Cancel an existing appointment by id, or by patientName (if the patient has exactly one active appointment).",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        patientName: { type: "string" },
      },
    },
  };
  readonly inputSchema = inputSchema;

  constructor(private readonly repo: AppointmentRepository) {}

  async execute(input: Input): Promise<ToolResult<Appointment>> {
    let id = input.appointmentId;
    if (!id && input.patientName) {
      const active = this.repo.findByPatient(input.patientName);
      if (active.length === 0) {
        return {
          ok: false,
          error: `No active appointment found for ${input.patientName}.`,
        };
      }
      if (active.length > 1) {
        return {
          ok: false,
          error: `${input.patientName} has ${active.length} active appointments; specify appointmentId.`,
        };
      }
      id = active[0].id;
    }
    if (!id) return { ok: false, error: "appointmentId required" };
    const cancelled = this.repo.cancel(id);
    if (!cancelled) {
      return { ok: false, error: `No appointment with id ${id}.` };
    }
    return { ok: true, data: cancelled };
  }
}
