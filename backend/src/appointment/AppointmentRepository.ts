import type { Appointment } from "../types/appointment.js";

export interface AppointmentRepository {
  list(): Appointment[];
  findById(id: string): Appointment | undefined;
  findByPatient(patientName: string): Appointment[];
  isSlotTaken(doctorId: string, date: string, time: string): boolean;
  hasConflict(patientName: string, date: string, time: string): boolean;
  create(a: Omit<Appointment, "id" | "createdAt" | "status">): Appointment;
  cancel(id: string): Appointment | undefined;
  reschedule(id: string, date: string, time: string): Appointment | undefined;
  reset(): void;
}
