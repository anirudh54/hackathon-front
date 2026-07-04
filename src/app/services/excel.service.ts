import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { AggType, ChartSpec, DataConstraints, DataRow, Filter, RenderedChart, Schema } from '../models/chat.model';

/**
 * Stateless helpers for the schema-only flow: parse a spreadsheet into rows,
 * classify columns, and aggregate locally once the backend returns a chart spec.
 */
@Injectable({ providedIn: 'root' })
export class ExcelService {
  /** Reads the first sheet of an .xlsx/.csv file into plain row objects. */
  async parse(file: File): Promise<DataRow[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<DataRow>(sheet, { defval: null, raw: true });
  }

  /** Classifies each column as numeric or categorical by sampling the first rows. */
  deriveSchema(rows: DataRow[]): Schema {
    const categorical: string[] = [];
    const numeric: string[] = [];
    if (!rows.length) return { categorical, numeric };

    const sample = rows.slice(0, 25);
    for (const col of Object.keys(rows[0])) {
      const values = sample.map((r) => r[col]).filter((v) => v !== null && v !== '');
      const numericCount = values.filter((v) => typeof v === 'number' || !isNaN(Number(v))).length;
      const looksNumeric = values.length > 0 && numericCount / values.length >= 0.8;
      (looksNumeric ? numeric : categorical).push(col);
    }
    return { categorical, numeric };
  }

  /** Aggregates rows by the spec into chart-ready labels + values. */
  aggregate(rows: DataRow[], spec: ChartSpec): RenderedChart {
    const buckets = new Map<string, number[]>();
    for (const row of rows) {
      const key = String(row[spec.groupBy] ?? '—');
      const value = Number(row[spec.measure]);
      if (!buckets.has(key)) buckets.set(key, []);
      if (!isNaN(value)) buckets.get(key)!.push(value);
    }

    const labels = [...buckets.keys()];
    const values = labels.map((label) => this.reduce(buckets.get(label)!, spec.agg));

    return {
      chartType: spec.chartType,
      title: `${this.aggLabel(spec.agg)} ${spec.measure} by ${spec.groupBy}`,
      labels,
      values,
    };
  }

  private reduce(nums: number[], agg: AggType): number {
    if (!nums.length) return 0;
    let result: number;
    switch (agg) {
      case 'avg':
        result = nums.reduce((a, b) => a + b, 0) / nums.length;
        break;
      case 'count':
        result = nums.length;
        break;
      case 'min':
        result = Math.min(...nums);
        break;
      case 'max':
        result = Math.max(...nums);
        break;
      default:
        result = nums.reduce((a, b) => a + b, 0);
    }
    return Math.round(result * 100) / 100;
  }

  /** Applies filters, sort, and limit to rows before aggregation. */
  applyConstraints(rows: DataRow[], constraints: DataConstraints): DataRow[] {
    let result = [...rows];

    // Apply filters
    if (constraints.filters?.length) {
      for (const f of constraints.filters) {
        result = result.filter((row) => this.matchFilter(row, f));
      }
    }

    // Apply sort
    if (constraints.sort) {
      const { column, direction } = constraints.sort;
      result.sort((a, b) => {
        const va = a[column];
        const vb = b[column];
        const na = Number(va);
        const nb = Number(vb);
        let cmp: number;
        if (!isNaN(na) && !isNaN(nb)) {
          cmp = na - nb;
        } else {
          cmp = String(va ?? '').localeCompare(String(vb ?? ''));
        }
        return direction === 'desc' ? -cmp : cmp;
      });
    }

    // Apply limit
    if (constraints.limit != null && constraints.limit > 0) {
      result = result.slice(0, constraints.limit);
    }

    return result;
  }

  private matchFilter(row: DataRow, f: Filter): boolean {
    const raw = row[f.column];
    const filterVal = f.value;

    // Try numeric comparison first
    const rowNum = Number(raw);
    const filterNum = Number(filterVal);
    const bothNumeric = !isNaN(rowNum) && !isNaN(filterNum);

    switch (f.op) {
      case 'eq':
        return bothNumeric ? rowNum === filterNum : String(raw) === String(filterVal);
      case 'neq':
        return bothNumeric ? rowNum !== filterNum : String(raw) !== String(filterVal);
      case 'gt':
        return bothNumeric ? rowNum > filterNum : String(raw) > String(filterVal);
      case 'gte':
        return bothNumeric ? rowNum >= filterNum : String(raw) >= String(filterVal);
      case 'lt':
        return bothNumeric ? rowNum < filterNum : String(raw) < String(filterVal);
      case 'lte':
        return bothNumeric ? rowNum <= filterNum : String(raw) <= String(filterVal);
      case 'contains':
        return String(raw ?? '').toLowerCase().includes(String(filterVal).toLowerCase());
      default:
        return true;
    }
  }

  private aggLabel(agg: AggType): string {
    return { sum: 'Total', avg: 'Average', count: 'Count of', min: 'Min', max: 'Max' }[agg];
  }
}

/** Bundled demo dataset so the app works before any upload. */
export const SAMPLE_DATA: DataRow[] = [
  { Region: 'North', Product: 'Widget', Amount: 120 },
  { Region: 'South', Product: 'Widget', Amount: 95 },
  { Region: 'East', Product: 'Widget', Amount: 140 },
  { Region: 'West', Product: 'Widget', Amount: 80 },
  { Region: 'North', Product: 'Gadget', Amount: 60 },
  { Region: 'South', Product: 'Gadget', Amount: 110 },
  { Region: 'East', Product: 'Gadget', Amount: 70 },
  { Region: 'West', Product: 'Gadget', Amount: 130 },
];
