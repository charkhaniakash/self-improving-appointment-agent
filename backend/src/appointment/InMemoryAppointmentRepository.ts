import type { Appointment } from "../types/appointment.js";
import type { AppointmentRepository } from "./AppointmentRepository.js";

export class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments: Appointment[] = [];
  private counter = 0;

  list(): Appointment[] {
    return [...this.appointments];
  }

  findById(id: string): Appointment | undefined {
    return this.appointments.find((a) => a.id === id);
  }

  findByPatient(patientName: string): Appointment[] {
    const q = patientName.toLowerCase().trim();
    return this.appointments.filter(
      (a) => a.patientName.toLowerCase() === q && a.status !== "cancelled",
    );
  }

  isSlotTaken(doctorId: string, date: string, time: string): boolean {
    return this.appointments.some(
      (a) =>
        a.doctorId === doctorId &&
        a.date === date &&
        a.time === time &&
        a.status !== "cancelled",
    );
  }

  hasConflict(patientName: string, date: string, time: string): boolean {
    return this.appointments.some(
      (a) =>
        a.patientName.toLowerCase() === patientName.toLowerCase() &&
        a.date === date &&
        a.time === time &&
        a.status !== "cancelled",
    );
  }

  create(a: Omit<Appointment, "id" | "createdAt" | "status">): Appointment {
    const appt: Appointment = {
      ...a,
      id: `appt_${++this.counter}`,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    this.appointments.push(appt);
    return appt;
  }

  cancel(id: string): Appointment | undefined {
    const a = this.findById(id);
    if (!a) return undefined;
    a.status = "cancelled";
    return a;
  }

  reschedule(id: string, date: string, time: string): Appointment | undefined {
    const a = this.findById(id);
    if (!a) return undefined;
    a.date = date;
    a.time = time;
    a.status = "confirmed";
    return a;
  }

  reset(): void {
    this.appointments = [];
    this.counter = 0;
  }
}
