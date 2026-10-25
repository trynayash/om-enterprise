# Import fixtures

One made-up price list ("Testline Pipes": 30 CPVC fittings in 4 sizes, group headings, a GST
column written both as `18%` and `0.18`, a Hindi product name, a "Terms" sheet) saved the ways
suppliers send price lists. `tests/unit/import-files.test.ts` checks that every one gives the same
import rows.

| File | Made with |
| --- | --- |
| `pricelist.xlsx` | openpyxl |
| `pricelist.xls`, `.ods`, `.csv`, `.html`, `.docx`, `.pdf` | LibreOffice 24.2, converted from the `.xlsx` |
| `pricelist-chrome.pdf` | Chromium "Save as PDF" of `pricelist.html`, with cell borders |
| `pricelist-word.pdf` | LibreOffice, from `pricelist.docx` (a borderless Word table with wrapped cells) |
| `catalogue.pdf` | reportlab: a small table under each product heading, wrapped descriptions, shaded rows |
| `grid-rotated.pdf` | reportlab: a bordered table on a page turned 90°, product names drawn letter by letter |
| `password.pdf`, `scan.pdf` | reportlab: needs a password to open; drawn shapes and no text |

Scans, for the text recognition tests (`tests/ocr/`, run with `npm run test:ocr`; they take about three minutes), all pictures of pages of the same list rendered from the Chromium PDF (and the catalogue):

| File | What it is |
| --- | --- |
| `scan-two-pages.pdf` | Two scanned pages in a PDF (pictures only, 200 dpi); the second is crooked (0.7°), shifted and blurred |
| `scan-photo.jpg` | A phone-style photo: tilted 1.8°, darker toward one side, reduced and JPEG-compressed |
| `scan-shadow.jpg` | A strong diagonal shadow (down to 45% brightness) and a 1.1° tilt |
| `scan-sideways.jpg` | The page turned 90° |
| `scan-catalogue.jpg` | The borderless catalogue page: product headings, wrapped descriptions |
| `scan-hindi.jpg` | A flat scan of a Hindi price list ("Choudhary Pipes": 12 CPVC fittings, codes `CH-101`…, Hindi headings, MRP and dealer rate), rendered in Chromium with Noto Sans Devanagari, grey, JPEG quality 55 |
| `scan-gujarati.jpg` | The same list in Gujarati (codes `GJ-101`…), as a phone-style photo: tilted 1°, darker toward the right edge, slightly blurred, JPEG quality 55 |
| `photo-catalogue.pdf` | A *text* PDF with a picture on each page and a caption under it: must not be sent to recognition |

All names, codes and prices are invented.
