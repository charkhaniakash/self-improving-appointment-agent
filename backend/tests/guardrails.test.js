import { describe, it, expect } from "vitest";
import { RubricEvaluator } from "../src/evaluation/RubricEvaluator.js";
import { InMemoryAppointmentRepository } from "../src/appointment/InMemoryAppointmentRepository.js";
describe("RubricEvaluator", () => {
    const evaluator = new RubricEvaluator();
    const repo = new InMemoryAppointmentRepository();
    it("flags a hallucinated confirmation with no successful book call", () => {
        const s = {
            id: "x",
            name: "x",
            description: "",
            turns: [],
            expectation: { noHallucinatedBooking: true },
        };
        const res = evaluator.evaluate(s, { messages: [], toolCalls: [] }, "Your appointment is confirmed for 10am.", repo);
        expect(res.passed).toBe(false);
        expect(res.criteria.find((c) => c.name === "No hallucinated booking")?.passed).toBe(false);
    });
    it("passes when book_appointment succeeded before confirmation", () => {
        const s = {
            id: "x",
            name: "x",
            description: "",
            turns: [],
            expectation: { noHallucinatedBooking: true },
        };
        const res = evaluator.evaluate(s, {
            messages: [],
            toolCalls: [
                {
                    name: "book_appointment",
                    input: {},
                    timestamp: "",
                    result: { ok: true, data: { id: "appt_1" } },
                },
            ],
        }, "Confirmed.", repo);
        expect(res.passed).toBe(true);
    });
    it("does not count failed forbidden-tool calls as violations", () => {
        const s = {
            id: "x",
            name: "x",
            description: "",
            turns: [],
            expectation: { forbiddenTools: ["book_appointment"] },
        };
        const res = evaluator.evaluate(s, {
            messages: [],
            toolCalls: [
                {
                    name: "book_appointment",
                    input: {},
                    timestamp: "",
                    result: { ok: false, error: "slot not offered" },
                },
            ],
        }, "", repo);
        expect(res.passed).toBe(true);
    });
});
