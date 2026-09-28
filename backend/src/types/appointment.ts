export interface Doctor {
  id: string;
  name: string;
  specialty: string;
}

export interface TimeSlot {
  doctorId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm 24h
}

export interface Appointment {
  id: string;
  patientName: string;
  doctorId: string;
  date: string;
  time: string;
  status: "confirmed" | "cancelled" | "rescheduled";
  createdAt: string;
}
