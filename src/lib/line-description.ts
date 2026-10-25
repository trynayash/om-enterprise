/**
 * The text of an item line on a bill: brand, product and option, e.g. "Finolex CPVC Elbow 90° — 20 mm".
 * The brand is left out when the product name already says it — it starts with the brand or with the
 * brand's first word ("Plumber Pillar Cock", not "Plumber Plumber Pillar Cock"; "Truflo CPVC Elbow",
 * not "Truflo by Hindware Truflo CPVC Elbow") — and the option is left out when it is the "Standard"
 * placeholder used for products that come in only one form.
 */
export function lineDescription(brand: string | null, product: string, variant: string | null): string {
  const name = brand && !nameSaysBrand(brand, product) ? `${brand} ${product}` : product;
  const option = optionLabel(variant);
  return option ? `${name} — ${option}` : name;
}

/** The option worth showing next to a product name, or null for none / the "Standard" placeholder. */
export function optionLabel(variant: string | null | undefined): string | null {
  return variant && variant.trim().toLowerCase() !== "standard" ? variant : null;
}

function nameSaysBrand(brand: string, product: string): boolean {
  const startsWith = (word: string) => new RegExp(`^${escapeRegExp(word)}\\b`, "i").test(product.trim());
  const first = brand.trim().split(/\s+/)[0] ?? "";
  // A first word of one or two letters ("A", "Om") is too common to stand for the brand.
  return startsWith(brand.trim()) || (first.length >= 3 && startsWith(first));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
