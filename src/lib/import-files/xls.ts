import { numberText, trimTable, type ImportTable } from "./text";

/**
 * Old Excel workbooks (.xls, Excel 97–2003, "BIFF8"): every worksheet as rows of text.
 * Reads the compound-file container, then the cell records: shared strings (which may run on
 * into CONTINUE records), labels, numbers, RK/MULRK numbers, booleans and formula results.
 * Formatting is ignored. Every loop is bounded so a damaged file fails instead of hanging.
 */
const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END_OF_CHAIN = 0xfffffffe;
const MAX_STREAM = 120_000_000;

export function isCompoundFile(b: Uint8Array): boolean {
  return b.length >= 512 && SIGNATURE.every((v, i) => b[i] === v);
}

export function readXls(data: Uint8Array): ImportTable[] {
  if (!isCompoundFile(data)) throw new Error("That file is not an Excel 97–2003 workbook (.xls)");
  const stream = compoundStream(data, ["workbook", "book"]);
  if (!stream) throw new Error("No workbook was found in that file. If it is a Word document, save it as .docx or PDF.");
  return biffSheets(stream);
}

// ---- Compound File Binary container ---------------------------------------------------------

function compoundStream(b: Uint8Array, names: string[]): Uint8Array | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const sectorShift = u16(0x1e);
  if (sectorShift !== 9 && sectorShift !== 12) throw new Error("That .xls file is damaged");
  const sectorSize = 1 << sectorShift;
  const miniSize = 1 << u16(0x20);
  const [numFat, firstDir, miniCutoff, firstMiniFat, firstDifat] = [u32(0x2c), u32(0x30), u32(0x38), u32(0x3c), u32(0x44)];
  const sectorCount = Math.floor(b.length / sectorSize);
  const offset = (n: number) => (n + 1) * sectorSize;
  const valid = (n: number) => n < sectorCount && offset(n) + sectorSize <= b.length;

  // The FAT is spread over sectors listed in the header and in a chain of DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && fatSectors.length < numFat; i++) fatSectors.push(u32(0x4c + i * 4));
  for (let d = firstDifat, guard = 0; valid(d) && fatSectors.length < numFat && guard < sectorCount; guard++) {
    for (let i = 0; i < sectorSize / 4 - 1 && fatSectors.length < numFat; i++) fatSectors.push(u32(offset(d) + i * 4));
    d = u32(offset(d) + sectorSize - 4);
  }
  const perSector = sectorSize / 4;
  const fat = new Uint32Array(fatSectors.length * perSector).fill(END_OF_CHAIN);
  fatSectors.forEach((s, k) => {
    if (valid(s)) for (let i = 0; i < perSector; i++) fat[k * perSector + i] = u32(offset(s) + i * 4);
  });

  const chain = (start: number, table: Uint32Array) => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s !== END_OF_CHAIN && s < table.length && !seen.has(s); s = table[s]) {
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readChain = (start: number, size: number) => {
    const sectors = chain(start, fat).filter(valid);
    const out = new Uint8Array(Math.min(size, sectors.length * sectorSize));
    sectors.forEach((s, i) => {
      const at = i * sectorSize;
      if (at < out.length) out.set(b.subarray(offset(s), offset(s) + Math.min(sectorSize, out.length - at)), at);
    });
    return out;
  };

  const dir = readChain(firstDir, MAX_STREAM);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameBytes = Math.min(64, Math.max(0, ddv.getUint16(o + 64, true) - 2));
    let name = "";
    for (let i = 0; i < nameBytes; i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
    entries.push({ name, type: dir[o + 66], start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true) });
  }
  const root = entries[0];
  const target = entries.find((e) => e.type === 2 && names.includes(e.name.toLowerCase()));
  if (!target || !root) return null;
  if (target.size > MAX_STREAM) throw new Error("That workbook is too large to read here");
  if (target.size >= miniCutoff) return readChain(target.start, target.size);

  // Small streams live in the "mini stream", in 64-byte sectors with their own FAT.
  const miniFatBytes = readChain(firstMiniFat, MAX_STREAM);
  const miniFat = new Uint32Array(Math.floor(miniFatBytes.length / 4));
  const mdv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  for (let i = 0; i < miniFat.length; i++) miniFat[i] = mdv.getUint32(i * 4, true);
  const miniStream = readChain(root.start, root.size);
  const out = new Uint8Array(target.size);
  chain(target.start, miniFat).forEach((s, i) => {
    const at = i * miniSize;
    if (at < out.length) out.set(miniStream.subarray(s * miniSize, s * miniSize + Math.min(miniSize, out.length - at)), at);
  });
  return out;
}

// ---- BIFF8 records --------------------------------------------------------------------------

const R = {
  BOF: 0x0809,
  EOF: 0x000a,
  FILEPASS: 0x002f,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  RSTRING: 0x00d6,
  NUMBER: 0x0203,
  RK: 0x027e,
  MULRK: 0x00bd,
  FORMULA: 0x0006,
  STRING: 0x0207,
  BOOLERR: 0x0205,
};

interface Record {
  type: number;
  data: Uint8Array;
  at: number;
}

function* records(s: Uint8Array, from: number): Generator<Record> {
  const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
  for (let o = from; o + 4 <= s.length; ) {
    const type = dv.getUint16(o, true);
    const len = dv.getUint16(o + 2, true);
    if (o + 4 + len > s.length) return;
    yield { type, data: s.subarray(o + 4, o + 4 + len), at: o };
    o += 4 + len;
  }
}

function biffSheets(s: Uint8Array): ImportTable[] {
  const it = records(s, 0);
  const first = it.next().value;
  if (!first || first.type !== R.BOF) throw new Error("That file is not an Excel workbook");
  const version = first.data.length >= 2 ? first.data[0] | (first.data[1] << 8) : 0;
  if (version !== 0x0600) throw new Error("That is an Excel 5/95 file. Open it in Excel and save it as .xlsx, then upload that.");

  const sheets: { name: string; pos: number }[] = [];
  const sstSegments: Uint8Array[] = [];
  let inSst = false;
  for (const r of it) {
    if (r.type === R.EOF) break;
    if (r.type === R.FILEPASS) throw new Error("That workbook is password-protected. Remove the password in Excel and upload it again.");
    if (r.type === R.BOUNDSHEET && r.data.length >= 8) {
      const pos = r.data[0] | (r.data[1] << 8) | (r.data[2] << 16) | (r.data[3] << 24);
      // Only worksheets (type 0); charts and macro sheets have no cells to import.
      if (r.data[5] === 0) sheets.push({ name: shortString(r.data.subarray(6)), pos: pos >>> 0 });
    }
    if (r.type === R.SST) {
      sstSegments.push(r.data);
      inSst = true;
    } else if (r.type === R.CONTINUE && inSst) sstSegments.push(r.data);
    else inSst = false;
  }
  const sst = sharedStrings(sstSegments);
  return sheets.map((sh) => ({ name: sh.name || "Sheet", rows: trimTable(sheetCells(s, sh.pos, sst)) }));
}

function sheetCells(s: Uint8Array, pos: number, sst: string[]): string[][] {
  const rows: string[][] = [];
  const put = (r: number, c: number, v: string) => {
    if (r > 65_535 || c > 255) return;
    while (rows.length <= r) rows.push([]);
    const row = rows[r];
    while (row.length < c) row.push("");
    row[c] = v;
  };
  let pendingFormula: [number, number] | null = null;
  const it = records(s, pos);
  const bof = it.next().value;
  if (!bof || bof.type !== R.BOF) return rows;
  for (const { type, data } of it) {
    if (type === R.EOF) break;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const rw = data.length >= 4 ? dv.getUint16(0, true) : 0;
    const col = data.length >= 4 ? dv.getUint16(2, true) : 0;
    switch (type) {
      case R.LABELSST:
        if (data.length >= 10) put(rw, col, sst[dv.getUint32(6, true)] ?? "");
        break;
      case R.LABEL:
      case R.RSTRING:
        if (data.length >= 9) put(rw, col, unicodeString(data, 6).text);
        break;
      case R.NUMBER:
        if (data.length >= 14) put(rw, col, numberText(dv.getFloat64(6, true)));
        break;
      case R.RK:
        if (data.length >= 10) put(rw, col, numberText(rkNumber(dv.getUint32(6, true))));
        break;
      case R.MULRK: {
        const count = Math.floor((data.length - 6) / 6);
        for (let i = 0; i < count; i++) put(rw, col + i, numberText(rkNumber(dv.getUint32(4 + i * 6 + 2, true))));
        break;
      }
      case R.BOOLERR:
        if (data.length >= 8 && data[7] === 0) put(rw, col, data[6] ? "TRUE" : "FALSE");
        break;
      case R.FORMULA: {
        if (data.length < 14) break;
        pendingFormula = null;
        if (data[12] === 0xff && data[13] === 0xff) {
          const kind = data[6];
          if (kind === 0) pendingFormula = [rw, col];
          else if (kind === 1) put(rw, col, data[8] ? "TRUE" : "FALSE");
        } else put(rw, col, numberText(dv.getFloat64(6, true)));
        break;
      }
      case R.STRING:
        if (pendingFormula && data.length >= 3) put(pendingFormula[0], pendingFormula[1], unicodeString(data, 0).text);
        pendingFormula = null;
        break;
    }
  }
  return rows;
}

function rkNumber(rk: number): number {
  let v: number;
  if (rk & 2) v = (rk | 0) >> 2;
  else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, rk & 0xfffffffc, true);
    v = buf.getFloat64(0, true);
  }
  return rk & 1 ? v / 100 : v;
}

/** ShortXLUnicodeString: 1-byte length, flags, characters (sheet names). */
function shortString(d: Uint8Array): string {
  if (d.length < 2) return "";
  return chars(d, 2, d[0], (d[1] & 1) === 1);
}

/** XLUnicodeString inside one record: 2-byte length, flags, characters. */
function unicodeString(d: Uint8Array, at: number): { text: string } {
  if (d.length < at + 3) return { text: "" };
  const cch = d[at] | (d[at + 1] << 8);
  return { text: chars(d, at + 3, cch, (d[at + 2] & 1) === 1) };
}

function chars(d: Uint8Array, at: number, count: number, wide: boolean): string {
  let s = "";
  for (let i = 0; i < count; i++) {
    const o = at + (wide ? i * 2 : i);
    if (o + (wide ? 1 : 0) >= d.length) break;
    s += String.fromCharCode(wide ? d[o] | (d[o + 1] << 8) : d[o]);
  }
  return s;
}

/**
 * The shared-string table. Strings run across record boundaries; when the characters of one
 * string continue in the next record, that record starts with a fresh flags byte saying whether
 * the rest is 1- or 2-byte characters.
 */
function sharedStrings(segments: Uint8Array[]): string[] {
  if (!segments.length || segments[0].length < 8) return [];
  let seg = 0;
  let pos = 8;
  const unique = new DataView(segments[0].buffer, segments[0].byteOffset).getUint32(4, true);
  const atEnd = () => seg >= segments.length;
  const nextSegment = () => {
    seg++;
    pos = 0;
  };
  const byte = (): number => {
    while (!atEnd() && pos >= segments[seg].length) nextSegment();
    if (atEnd()) throw new RangeError("end of shared strings");
    return segments[seg][pos++];
  };
  const skip = (n: number) => {
    for (let i = 0; i < n; i++) byte();
  };
  const out: string[] = [];
  try {
    for (let k = 0; k < unique && k < 2_000_000; k++) {
      const cch = byte() | (byte() << 8);
      const flags = byte();
      let wide = (flags & 1) === 1;
      const runs = flags & 8 ? byte() | (byte() << 8) : 0;
      const ext = flags & 4 ? byte() | (byte() << 8) | (byte() << 16) | (byte() << 24) : 0;
      let s = "";
      for (let i = 0; i < cch; i++) {
        if (pos >= segments[seg].length) {
          nextSegment();
          if (atEnd()) throw new RangeError("end of shared strings");
          wide = (segments[seg][pos++] & 1) === 1;
        }
        s += String.fromCharCode(wide ? byte() | (byte() << 8) : byte());
      }
      skip(runs * 4);
      skip(Math.max(0, ext));
      out.push(s);
    }
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
  }
  return out;
}
