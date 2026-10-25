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

All names, codes and prices are invented.
