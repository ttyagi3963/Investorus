// Guards the body-parser edge (constitution VII): a body that is not JSON is the caller's mistake
// (400) and one over the 1 MB limit is 413, never a 500 or an error report, even before sign-in.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorTranslator } from "./errors.js";

function appWith(report: () => void) {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.post("/echo", (req, res) => void res.json(req.body));
  app.use(errorTranslator({ report }));
  return app;
}

describe("errorTranslator and the JSON body", () => {
  it("answers malformed JSON with 400 and an oversized body with 413, reporting neither", async () => {
    const report = vi.fn();
    const app = appWith(report);
    const malformed = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("VALIDATION_FAILED");
    const oversized = await request(app)
      .post("/echo")
      .send({ text: "x".repeat(2_000) });
    expect(oversized.status).toBe(413);
    expect(report).not.toHaveBeenCalled();
  });
});
