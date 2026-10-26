import { describe, expect, it } from "vitest";
import { withExplicitSsl } from "@/server/db/ssl";

describe("withExplicitSsl", () => {
  it("names verify-full where the driver would warn about the older spellings", () => {
    for (const mode of ["require", "prefer", "verify-ca", "REQUIRE"]) {
      expect(withExplicitSsl(`postgres://u:p@host.neon.tech/db?sslmode=${mode}`)).toBe("postgres://u:p@host.neon.tech/db?sslmode=verify-full");
    }
    expect(withExplicitSsl("postgres://u:p@h/db?connect_timeout=10&sslmode=require&application_name=om")).toBe("postgres://u:p@h/db?connect_timeout=10&sslmode=verify-full&application_name=om");
  });

  it("leaves everything else alone", () => {
    for (const url of [
      "postgres://u:p@localhost:5432/om_dev",
      "postgres://u:p@h/db?sslmode=verify-full",
      "postgres://u:p@h/db?sslmode=disable",
      "postgres://u:p@h/db?sslmode=require&uselibpqcompat=true".replace("sslmode=require", "sslmode=no-verify"),
      "postgres://u:sslmode=require@h/db",
    ]) {
      expect(withExplicitSsl(url)).toBe(url);
    }
  });
});
