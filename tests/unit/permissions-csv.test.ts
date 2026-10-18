import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, DEFAULT_ROLES, SUPER_ADMIN_ONLY } from "@/lib/permissions";
import { landingPath, visibleNav } from "@/lib/nav";
import { parseCsv } from "@/server/services/import";
import { toCsv } from "@/server/services/reports";

describe("default roles", () => {
  const role = (k: string) => DEFAULT_ROLES.find((r) => r.key === k)!;
  it("never give Sales access to costs, prices, settings or staff", () => {
    const sales = new Set<string>(role("sales").permissions);
    for (const p of ["costs.view", "costs.edit", "prices.edit", "prices.approve", "users.manage", "settings.tax", "discounts.configure", "sales.view_all"]) {
      expect(sales.has(p)).toBe(false);
    }
  });
  it("never give Admins master-price approval, cost editing, tax or security by default", () => {
    const admin = new Set<string>(role("admin").permissions);
    for (const p of ["prices.approve", "costs.edit", "settings.tax", "discounts.configure", "users.manage", "documents.cancel", "payments.refund", "payments.reverse"]) {
      expect(admin.has(p)).toBe(false);
    }
  });
  it("keeps the accountant read-only", () => {
    const acc = role("accountant").permissions;
    expect(acc.every((p) => p.endsWith(".view") || p.endsWith(".view_all") || ["reports.profit", "reports.export", "documents.reprint"].includes(p))).toBe(true);
  });
  it("only uses catalogue permissions; super-admin-only powers are not grantable", () => {
    for (const r of DEFAULT_ROLES) for (const p of r.permissions) expect(ALL_PERMISSIONS).toContain(p);
    for (const p of SUPER_ADMIN_ONLY) expect(ALL_PERMISSIONS).not.toContain(p);
  });
  it("sends Sachin to the POS and admins to the dashboard", () => {
    expect(landingPath(role("sales").permissions, false)).toBe("/pos");
    expect(landingPath(role("admin").permissions, false)).toBe("/dashboard");
    const salesNav = visibleNav(role("sales").permissions, false).flatMap((g) => g.items.map((i) => i.href));
    expect(salesNav).toContain("/pos");
    expect(salesNav).not.toContain("/dashboard/staff");
    expect(salesNav).not.toContain("/dashboard/reports");
  });
});

describe("CSV", () => {
  it("parses quoted fields, embedded commas, quotes and newlines, BOM and CRLF", () => {
    const csv = '﻿name,spec\r\n"Pipe, CPVC","Size: ¾""; Class: SDR 11"\r\n"Multi\nline",x\r\n';
    expect(parseCsv(csv)).toEqual([
      ["name", "spec"],
      ["Pipe, CPVC", 'Size: ¾"; Class: SDR 11'],
      ["Multi\nline", "x"],
    ]);
  });
  it("exports CSV safely (escaping and formula-injection guard)", () => {
    const out = toCsv([{ a: "=HYPERLINK(1)", b: 'say "hi"', c: -5, d: null }]);
    expect(out.split("\r\n")[1]).toBe(`'=HYPERLINK(1),"say ""hi""",-5,`);
  });
});
