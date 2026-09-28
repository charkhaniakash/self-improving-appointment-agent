import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryAppointmentRepository } from "../src/appointment/InMemoryAppointmentRepository.js";
import { CheckAvailabilityTool } from "../src/tools/CheckAvailabilityTool.js";
import { BookAppointmentTool } from "../src/tools/BookAppointmentTool.js";
import { CancelAppointmentTool } from "../src/tools/CancelAppointmentTool.js";
import { RescheduleAppointmentTool } from "../src/tools/RescheduleAppointmentTool.js";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";

describe("Tools", () => {
  let repo: InMemoryAppointmentRepository;
  let check: CheckAvailabilityTool;
  let book: BookAppointmentTool;
  let cancel: CancelAppointmentTool;
  let resched: RescheduleAppointmentTool;

  beforeEach(() => {
    repo = new InMemoryAppointmentRepository();
    check = new CheckAvailabilityTool(repo);
    book = new BookAppointmentTool(repo);
    cancel = new CancelAppointmentTool(repo);
    resched = new RescheduleAppointmentTool(repo);
  });

  it("checks a real offered slot as available", async () => {
    const r = await check.execute({
      doctor: "Dr. Sharma",
      date: "2026-09-29",
      time: "10:00",
    });
    expect(r.ok).toBe(true);
    expect(r.data?.available).toBe(true);
  });

  it("returns unavailable for an unoffered slot", async () => {
    const r = await check.execute({
      doctor: "Dr. Sharma",
      date: "2026-09-29",
      time: "08:00",
    });
    expect(r.ok).toBe(true);
    expect(r.data?.available).toBe(false);
  });

  it("books an offered slot", async () => {
    const r = await book.execute({
      patientName: "A",
      doctor: "Dr. Sharma",
      date: "2026-09-29",
      time: "10:00",
    });
    expect(r.ok).toBe(true);
    expect(repo.findByPatient("A")).toHaveLength(1);
  });

  it("refuses to book a slot the doctor does not offer", async () => {
    const r = await book.execute({
      patientName: "A",
      doctor: "Dr. Sharma",
      date: "2026-09-29",
      time: "08:00",
    });
    expect(r.ok).toBe(false);
    expect(repo.list()).toHaveLength(0);
  });

  it("refuses to double-book the same slot", async () => {
    await book.execute({
      patientName: "A",
      doctor: "Dr. Sharma",
      date: "2026-09-29",
      time: "10:00",
    });
    const r = await book.execute({
      patientName: "B",
      doctor: "Dr. Sharma",
      date: "2026-09-29",
      time: "10:00",
    });
    expect(r.ok).toBe(false);
    expect(repo.list()).toHaveLength(1);
  });

  it("cancels an existing appointment", async () => {
    await book.execute({
      patientName: "A",
      doctor: "Dr. Sharma",
      date: "2026-09-29",
      time: "10:00",
    });
    const r = await cancel.execute({ patientName: "A" });
    expect(r.ok).toBe(true);
    expect(repo.findByPatient("A")).toHaveLength(0);
  });

  it("reschedules an existing appointment to a valid slot", async () => {
    await book.execute({
      patientName: "A",
      doctor: "Dr. Sharma",
      date: "2026-09-29",
      time: "10:00",
    });
    const r = await resched.execute({
      patientName: "A",
      newDate: "2026-09-30",
      newTime: "11:00",
    });
    expect(r.ok).toBe(true);
    expect(r.data?.time).toBe("11:00");
  });

  it("registry surfaces validation errors, not thrown exceptions", async () => {
    const reg = new ToolRegistry([book as never]);
    const rec = await reg.invoke("book_appointment", { doctor: "x" });
    expect(rec.result.ok).toBe(false);
    expect(rec.result.error).toMatch(/Invalid input/);
  });

  it("registry injects failures without touching real tool logic", async () => {
    const reg = new ToolRegistry([check as never]);
    reg.setFailures({ check_availability: "Simulated outage" });
    const rec = await reg.invoke("check_availability", {
      doctor: "Dr. Sharma",
      date: "2026-09-29",
    });
    expect(rec.result.ok).toBe(false);
    expect(rec.result.error).toBe("Simulated outage");
  });
});
