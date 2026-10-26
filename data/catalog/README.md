# Real product catalogue (data files)

One JSON file per brand group, loaded by `npm run import:products` (`scripts/import-products.ts`).
The import is **idempotent by SKU**: products and sizes (variants) whose SKU already exists are left
as they are, and a new SKU added to an existing product becomes a new size of it, so it is safe to
run on every deploy. Nothing here is sample data.

## Rules for anyone editing these files

- **Only facts from public, official sources** (manufacturer website, published price list,
  product data sheet). Never invent a specification, price, warranty or image. Unknown → `null`
  or leave the field out.
- Every product lists the pages it came from in `sourceUrls`; every price says where it came from
  in `priceSource` (document or page + the date it was read).
- Descriptions are short (2–4 sentences), factual and **in our own words** (don't paste marketing
  copy).
- Prices are imported as **proposals waiting for the Super Admin's approval** (Dashboard → Price
  review). The website shows "Price on request" until a price is approved. List prices are what the
  manufacturer publishes; the shop's own selling price may be lower.
- `marketPrice` is a researched price a local dealer charges today (incl. GST), with
  `marketPriceSource` saying what it is based on. The deploy build runs the import with
  `--apply-market-prices`, which makes it the selling price of any variant that has **no approved
  price yet** (a pending list-price proposal is replaced). Once the owner approves or sets a price,
  the import never changes it again.
- Descriptions, specifications and warranty text are customer-facing: write them for a customer,
  not as research notes (no "per the listing", "source says", conflicting readings). The deploy
  build also runs `--refresh-content`, so a corrected text reaches products already imported, unless
  someone has edited that product in the dashboard; the shop's own text always wins.
- `images` must be direct links to image files (`.jpg`, `.png`, `.webp`) on the manufacturer's own
  site or CDN. They are downloaded on the server during import, re-encoded to WebP and stored in the
  database. A link that fails is reported and skipped.

## File format

```jsonc
{
  "group": "berger-paints",            // file name without .json
  "researchedOn": "2026-10-23",
  "notes": ["Anything a reviewer should know: gaps, unconfirmed items…"],
  "products": [
    {
      "category": "berger-paints",     // one of the category slugs below
      "brand": "Berger",               // created if missing
      "manufacturer": "Berger Paints India Ltd.",
      "name": "Berger Silk Glamor",    // as the manufacturer names it
      "model": null,                   // model / series code if any
      "description": "2–4 factual sentences in our own words.",
      "unit": "pcs",                   // selling unit code (list below)
      "hsn": "3209",                   // 4–8 digits
      "gstRate": "18",                 // "18", "5" or "0"
      "warranty": null,                // only if the manufacturer states it
      "specifications": [{ "label": "Finish", "value": "Sheen" }],
      "variantAttributes": ["Pack size"],
      "images": ["https://…/product.png"],
      "sourceUrls": ["https://…/product-page"],
      "altUnit": null,                 // e.g. { "unit": "length", "factor": "3" } = 1 length is 3 m
      "featured": false,               // show on the homepage "Popular" row (a few per category)
      "variants": [
        {
          "sku": "BRG-SILKGLAM-1L",    // unique across ALL files; brand prefix below
          "name": "1 L",
          "attributes": { "Pack size": "1 L" },
          "barcode": null,
          "listPrice": "820.00",       // manufacturer's published price for ONE selling unit, or null
          "listPriceIncludesTax": true,
          "mrp": "820.00",             // MRP (incl. tax) if published, else null
          "priceSource": "Berger website product page, MRP shown on 23 Oct 2026",
          "marketPrice": "790.00",     // researched dealer price incl. GST, or null
          "marketPriceSource": "What it is based on, where and when"
        }
      ]
    }
  ]
}
```

### Category slugs

`berger-paints` · `umiya-gold-water-tanks` · `bathware-sanitary` · `cpvc-pipes-fittings` ·
`pvc-upvc-pipes-fittings` · `swr-drainage` · `plumbing-accessories` · `other-building-materials`

### Unit codes

`pcs` `nos` `ltr` `bucket` `m` (decimals allowed) `ft` `length` (one pipe length) `kg` `box` `set`
`roll` `pack` `bag`

Pipes: use the unit the price list prices in (usually per metre `m`, or per `length`), and set
`altUnit` for the standard length (e.g. 3 m or 6 m) when the list states it.

### SKU prefixes

`BRG-` Berger · `TRF-` Truflo by Hindware · `FNX-` Finolex · `UMG-` Umiya Gold · `AGL-` AGL ·
`BLU-` Blues · `ARS-` Aris · `PLB-` Plumber · `NSL-` NeoSeal

### Common HSN codes (rates must still be confirmed by the shop's accountant)

| Goods | HSN |
|---|---|
| Water-based paints / emulsions / distempers | 3209 |
| Solvent-based paints, enamels, varnishes | 3208 |
| Wall putty, fillers | 3214 |
| Plastic pipes, tubes and fittings (CPVC, UPVC, PVC, SWR) | 3917 |
| Plastic tanks, reservoirs (> 300 L) | 3925 |
| Plastic baths, seats, cisterns, sanitary ware | 3922 |
| Taps, cocks, valves | 8481 |
| Ceramic sanitary ware (basins, WCs) | 6910 |
| Solvent cement, adhesives | 3506 |
| PTFE / thread-seal tape | 3919 |
