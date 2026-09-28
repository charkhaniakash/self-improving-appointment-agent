import { z } from "zod";
import type { Tool, ToolResult } from "../types/tool.js";
import type { AppointmentRepository } from "../appointment/AppointmentRepository.js";
import {
  AVAILABILITY,
  findDoctorByNameOrId,
} from "../appointment/clinicData.js";

const inputSchema = z.object({
  doctor: z.string().min(1, "doctor is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "time must be HH:mm 24h")
    .optional(),
});

type Input = z.infer<typeof inputSchema>;

interface Output {
  doctorId: string;
  doctorName: string;
  available: boolean;
  matchedSlot?: { date: string; time: string };
  suggestions?: Array<{ date: string; time: string }>;
}

export class CheckAvailabilityTool implements Tool<Input, Output> {
  readonly schema = {
    name: "check_availability",
    description:
      "Check whether a doctor has an available slot on a given date, optionally at a specific time. Returns matched slot or suggestions.",
    parameters: {
      type: "object",
      properties: {
        doctor: {
          type: "string",
          description: "Doctor name or id, e.g. 'Dr. Sharma' or 'dr_sharma'",
        },
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format",
        },
        time: {
          type: "string",
          description: "Optional preferred time in HH:mm 24h format",
        },
      },
      required: ["doctor", "date"],
    },
  };
  readonly inputSchema = inputSchema;

  constructor(private readonly repo: AppointmentRepository) {}

  async execute(input: Input): Promise<ToolResult<Output>> {
    const doctor = findDoctorByNameOrId(input.doctor);
    if (!doctor) {
      return { ok: false, error: `Unknown doctor: ${input.doctor}` };
    }
    const slots = AVAILABILITY[doctor.id] ?? [];
    const onDate = slots
      .filter((s) => s.startsWith(input.date))
      .map((s) => ({ date: input.date, time: s.split(" ")[1] }))
      .filter((s) => !this.repo.isSlotTaken(doctor.id, s.date, s.time));

    if (onDate.length === 0) {
      return {
        ok: true,
        data: {
          doctorId: doctor.id,
          doctorName: doctor.name,
          available: false,
          suggestions: [],
        },
      };
    }

    if (input.time) {
      const matched = onDate.find((s) => s.time === input.time);
      if (matched) {
        return {
          ok: true,
          data: {
            doctorId: doctor.id,
            doctorName: doctor.name,
            available: true,
            matchedSlot: matched,
          },
        };
      }
      return {
        ok: true,
        data: {
          doctorId: doctor.id,
          doctorName: doctor.name,
          available: false,
          suggestions: onDate,
        },
      };
    }

    return {
      ok: true,
      data: {
        doctorId: doctor.id,
        doctorName: doctor.name,
        available: true,
        suggestions: onDate,
      },
    };
  }
}
