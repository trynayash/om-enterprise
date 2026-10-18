import { describe, expect, it } from "vitest";
import { amountInWords, D, formatINR, m, r2 } from "@/lib/money";

describe("money helpers", () => {
  it("rounds half-up to paise", () => {
    expect(m("1.005")).toBe("1.01");
    expect(m("1.004")).toBe("1.00");
    expect(r2("2.675").toFixed(2)).toBe("2.68"); // the classic float trap
    expect(D("0.1").plus("0.2").toFixed(2)).toBe("0.30");
  });

  it("formats rupees with Indian digit grouping", () => {
    expect(formatINR("1234567.8")).toBe("₹12,34,567.80");
    expect(formatINR("0")).toBe("₹0.00");
    expect(formatINR(null)).toBe("—");
  });

  it("writes amounts in words using lakh / crore", () => {
    expect(amountInWords("123456.78")).toBe(
      "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only",
    );
    expect(amountInWords("10000000")).toBe("Rupees One Crore Only");
    expect(amountInWords("1001")).toBe("Rupees One Thousand One Only");
    expect(amountInWords("0")).toBe("Rupees Zero Only");
    expect(amountInWords("99.5")).toBe("Rupees Ninety Nine and Fifty Paise Only");
    expect(amountInWords("2500000")).toBe("Rupees Twenty Five Lakh Only");
    expect(amountInWords("1234567890")).toBe(
      "Rupees One Hundred Twenty Three Crore Forty Five Lakh Sixty Seven Thousand Eight Hundred Ninety Only",
    );
  });
});
