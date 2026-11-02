import { describe, it, expect } from "vitest";
import { rebaseSessionExpiry } from "../src/lib/authClockFix";

// Device clock 1 hour ahead of the server.
const serverNow = 1_793_653_360;
const deviceNow = serverNow + 3600;

describe("sign-in session expiry with a wrong device clock", () => {
  it("re-bases expires_at on the device clock so a 1-hour session is not already expired", () => {
    const body = { access_token: "t", refresh_token: "r", expires_in: 3600, expires_at: serverNow + 3600 };
    expect(rebaseSessionExpiry(body, deviceNow)).toBe(true);
    expect(body.expires_at).toBe(deviceNow + 3600);
  });

  it("re-bases a nested session too", () => {
    const body = { user: {}, session: { access_token: "t", expires_in: 3600, expires_at: serverNow + 3600 } };
    rebaseSessionExpiry(body, deviceNow);
    expect(body.session.expires_at).toBe(deviceNow + 3600);
  });

  it("leaves non-session responses alone", () => {
    const body = { id: "user-1", email: "a@b.com" };
    expect(rebaseSessionExpiry(body, deviceNow)).toBe(false);
    expect(body).toEqual({ id: "user-1", email: "a@b.com" });
  });
});
