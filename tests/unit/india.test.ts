import { describe, expect, it } from "vitest";
import {
  buildUpiUri,
  financialYear,
  formatPhone,
  formatDocNumber,
  fyShort,
  gstinCheckChar,
  isValidUpiUtr,
  istStartOfDay,
  normalizeMobile,
  slugify,
  stateName,
  validateGstin,
  whatsappLink,
} from "@/lib/india";

describe("GSTIN", () => {
  const base = "24ABCDE1234F1Z";
  const valid = `${base}${gstinCheckChar(base)}`;
  it("accepts a GSTIN with the correct mod-36 check character and derives the state", () => {
    const r = validateGstin(valid.toLowerCase());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized).toBe(valid);
      expect(r.stateCode).toBe("24");
    }
  });
  it("rejects a wrong check character, bad format and unknown state codes", () => {
    const wrong = `${base}${gstinCheckChar(base) === "0" ? "1" : "0"}`;
    expect(validateGstin(wrong).ok).toBe(false);
    expect(validateGstin("24ABCDE1234F1Y5").ok).toBe(false);
    const unknown = "99ABCDE1234F1Z";
    expect(validateGstin(`${unknown}${gstinCheckChar(unknown)}`).ok).toBe(false);
  });
  it("matches a known published check digit example", () => {
    // Well-known example from GST documentation: 27AAPFU0939F1ZV
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
  });
});

describe("financial year & document numbers (IST)", () => {
  it("rolls over on 1 April in India Standard Time, not UTC", () => {
    expect(financialYear(new Date("2026-03-31T18:29:59Z"))).toBe("2025-26"); // 23:59:59 IST, 31 Mar
    expect(financialYear(new Date("2026-03-31T18:30:00Z"))).toBe("2026-27"); // 00:00 IST, 1 Apr
    expect(financialYear(new Date("2027-01-15T10:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2099-12-31T10:00:00Z"))).toBe("2099-00");
  });
  it("formats document numbers within Rule 46's 16-character limit", () => {
    expect(formatDocNumber("OE", "2026-27", 42)).toBe("OE/26-27/00042");
    expect(formatDocNumber("TRN", "2026-27", 1)).toBe("TRN/26-27/00001");
    expect(fyShort("2026-27")).toBe("26-27");
    expect(() => formatDocNumber("toolong", "2026-27", 1)).toThrow();
    expect(() => formatDocNumber("ABCD", "2026-27", 1234567)).toThrow(/16/);
  });
  it("computes the IST start of day", () => {
    expect(istStartOfDay(new Date("2026-10-18T20:00:00Z")).toISOString()).toBe("2026-10-18T18:30:00.000Z");
  });
});

describe("UPI", () => {
  it("encodes the exact amount and payee in the NPCI URI format", () => {
    const uri = buildUpiUri({ vpa: "omenterprise@okaxis", payeeName: "OM ENTERPRISE", amount: "4484.00", note: "OM ENTERPRISE S000123" });
    expect(uri).toBe("upi://pay?pa=omenterprise%40okaxis&pn=OM%20ENTERPRISE&am=4484.00&cu=INR&tn=OM%20ENTERPRISE%20S000123");
  });
  it("refuses invalid VPAs and amounts without two decimals", () => {
    expect(() => buildUpiUri({ vpa: "not-a-vpa", payeeName: "X", amount: "1.00", note: "x" })).toThrow();
    expect(() => buildUpiUri({ vpa: "a@b", payeeName: "X", amount: "1", note: "x" })).toThrow();
  });
  it("validates 12-digit UTRs", () => {
    expect(isValidUpiUtr("412345678901")).toBe(true);
    expect(isValidUpiUtr("41234567890")).toBe(false);
    expect(isValidUpiUtr("41234567890A")).toBe(false);
  });
});

describe("contact helpers", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizeMobile("+91 76219 34414")).toBe("7621934414");
    expect(normalizeMobile("07621934414")).toBe("7621934414");
    expect(normalizeMobile("12345")).toBeNull();
    expect(normalizeMobile("5621934414")).toBeNull();
  });
  it("formats phone numbers for display", () => {
    expect(formatPhone("7621934414")).toBe("+91 76219 34414");
    expect(formatPhone("+91-76219-34414")).toBe("+91 76219 34414");
    expect(formatPhone("02669 233445")).toBe("02669 233445");
  });
  it("builds WhatsApp links with the country code", () => {
    expect(whatsappLink("7621934414", "Hi")).toBe("https://wa.me/917621934414?text=Hi");
  });
  it("slugifies and names states", () => {
    expect(slugify("CPVC Pipes & Fittings")).toBe("cpvc-pipes-fittings");
    expect(stateName("24")).toBe("Gujarat");
  });
});
