import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import type { Schema } from '../types.js';

/* SheetJS ESM build doesn't auto-detect Node fs — wire it up manually. */
XLSX.set_fs(fs);

const DATA_DIR = path.resolve('data');
const DATA_FILE = path.join(DATA_DIR, 'sales.xlsx');

/** Creates a sample sales.xlsx if one doesn't already exist. */
export function ensureSampleFile(): void {
  if (fs.existsSync(DATA_FILE)) return;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const rows = [
    ['Region', 'Product', 'Amount'],
    ['North', 'Widget', 120],
    ['South', 'Widget', 95],
    ['East', 'Widget', 140],
    ['West', 'Widget', 80],
    ['North', 'Gadget', 60],
    ['South', 'Gadget', 110],
    ['East', 'Gadget', 70],
    ['West', 'Gadget', 130],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  XLSX.writeFile(wb, DATA_FILE);
}

/** Reads the sample file and returns column names split by type. */
export function getSchema(): Schema {
  const wb = XLSX.readFile(DATA_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (data.length < 2) {
    return { categorical: [], numeric: [] };
  }

  const header = data[0] as string[];
  const firstRow = data[1];

  const categorical: string[] = [];
  const numeric: string[] = [];

  for (let i = 0; i < header.length; i++) {
    if (typeof firstRow[i] === 'number') {
      numeric.push(header[i]);
    } else {
      categorical.push(header[i]);
    }
  }

  return { categorical, numeric };
}
