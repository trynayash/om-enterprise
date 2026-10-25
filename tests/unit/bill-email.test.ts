import { describe, expect, it } from "vitest";
import { billEmail, maskEmail } from "@/server/email/bill-email";
import type { DocSnapshot } from "@/lib/document-types";

/** Only what the email reads of a bill. */
function bill(over: Partial<{ docType: string; buyerName: string | null; paymentStatus: string; balanceDue: string; phone: string; shop: string }> = {}): DocSnapshot {
  return {
    docType: over.docType ?? "bill_of_supply",
    number: "BS/26-27/00003",
    seller: { name: over.shop ?? "OM ENTERPRISE", addressLines: ["Opp. Shardha Dhaba 2, Bodeli Road", "Naswadi, Gujarat 391150"], phone: over.phone ?? "+91 76219 34414", email: "shop@example.com" },
    buyer: over.buyerName === null ? null : { name: over.buyerName ?? "Ramesh Patel" },
    totals: { grandTotal: "265.00" },
    paymentStatus: over.paymentStatus ?? "Paid",
    balanceDue: over.balanceDue ?? "0.00",
  } as unknown as DocSnapshot;
}

describe("billEmail", () => {
  it("says what the document is, who it is for and what it comes to, in plain words", () => {
    const m = billEmail(bill(), { viewUrl: "https://shop.example/d/abc123" });
    expect(m.subject).toBe("Bill of Supply BS/26-27/00003 from OM ENTERPRISE");
    expect(m.text).toContain("Hello Ramesh Patel,");
    expect(m.text).toContain("Your bill of supply BS/26-27/00003 for ₹265.00 is attached as a PDF.");
    expect(m.text).toContain("Payment received in full.");
    expect(m.text).toContain("View it online: https://shop.example/d/abc123");
    expect(m.text).toContain("reply to this email or call us on +91 76219 34414");
    expect(m.text.split("\n").slice(-4)).toEqual(["OM ENTERPRISE", "Opp. Shardha Dhaba 2, Bodeli Road", "Naswadi, Gujarat 391150", "+91 76219 34414"]);
  });

  it("leaves out the link, the greeting's name and the payment line when there is nothing to say", () => {
    const m = billEmail(bill({ buyerName: null, docType: "quotation", paymentStatus: "Unpaid" }));
    expect(m.text).toContain("Hello,");
    expect(m.text).toContain("Your quotation BS/26-27/00003");
    expect(m.text).not.toMatch(/View it online|Payment received/);
    expect(m.html).not.toContain("<a ");
  });

  it("states a balance still due", () => {
    const m = billEmail(bill({ paymentStatus: "Partially paid", balanceDue: "100.00" }));
    expect(m.text).toContain("Balance due: ₹100.00.");
    expect(m.text).not.toContain("Payment received in full.");
  });

  it("escapes anything a person typed before it goes into the HTML", () => {
    const m = billEmail(bill({ buyerName: `<script>alert(1)</script> & "Sons" <b>`, shop: "Patel & <Co>" }), { viewUrl: `https://shop.example/d/x"onmouseover="y` });
    expect(m.html).not.toContain("<script");
    // The quote in the link is escaped, so it cannot close the attribute and start another.
    expect(m.html).not.toContain('onmouseover="');
    expect(m.html).toContain("x&quot;onmouseover=&quot;y");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Sons&quot; &lt;b&gt;");
    expect(m.html).toContain("Patel &amp; &lt;Co&gt;");
    // The text version is plain text and carries the words as typed.
    expect(m.text).toContain(`<script>alert(1)</script> & "Sons" <b>`);
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("ramesh@example.com")).toBe("r***@example.com");
    expect(maskEmail("nonsense")).toBe("***");
  });
});
