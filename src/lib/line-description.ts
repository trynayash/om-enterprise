/**
 * The text of an item line on a bill: brand, product and option, e.g. "Finolex CPVC Elbow 90° — 20 mm".
 * The brand is left out when the product name already starts with it ("Plumber Pillar Cock", not
 * "Plumber Plumber Pillar Cock"), and the option is left out when it is the "Standard" placeholder
 * used for products that come in only one form.
 */
export function lineDescription(brand: string | null, product: string, variant: string | null): string {
  const startsWithBrand = brand !== null && new RegExp(`^${escapeRegExp(brand.trim())}\\b`, "i").test(product.trim());
  const name = brand && !startsWithBrand ? `${brand} ${product}` : product;
  const option = optionLabel(variant);
  return option ? `${name} — ${option}` : name;
}

/** The option worth showing next to a product name, or null for none / the "Standard" placeholder. */
export function optionLabel(variant: string | null | undefined): string | null {
  return variant && variant.trim().toLowerCase() !== "standard" ? variant : null;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
