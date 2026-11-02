import { describe, it, expect } from "vitest";
import { computeClockSkewMs, isClockSkewed, describeSkew } from "../src/lib/clockSkew";

const server = "Mon, 02 Nov 2026 21:00:00 GMT";
const serverMs = Date.parse(server);

describe("clock skew detection", () => {
  it("flags a device clock more than 5 minutes ahead", () => {
    const skew = computeClockSkewMs(server, serverMs + 61 * 60 * 1000);
    expect(isClockSkewed(skew)).toBe(true);
    expect(describeSkew(skew!)).toBe("61 minutes ahead");
  });

  it("does not flag a device clock within 5 minutes", () => {
    expect(isClockSkewed(computeClockSkewMs(server, serverMs + 4 * 60 * 1000))).toBe(false);
  });

  it("ignores a missing server time", () => {
    expect(isClockSkewed(computeClockSkewMs(null, serverMs))).toBe(false);
  });
});
