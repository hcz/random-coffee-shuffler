import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  excelDateToJSDate,
  parseDate,
  formatDateAsISO,
  normalizeDatesInTable2,
  removeEmptyRows,
  detectNextRoundNumber,
} = require('./index');

describe('index utility functions', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('excelDateToJSDate', () => {
    it('should convert Excel serial date to JavaScript Date', () => {
      // Excel serial 44927 = January 1, 2023
      const result = excelDateToJSDate(44927);
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(1);
    });

    it('should convert Excel serial date for March 15, 2024', () => {
      // Excel serial 45366 = March 15, 2024
      const result = excelDateToJSDate(45366);
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(2); // March
      expect(result.getDate()).toBe(15);
    });

    it('should return null for non-number input', () => {
      expect(excelDateToJSDate('not a number')).toBeNull();
      expect(excelDateToJSDate(null)).toBeNull();
      expect(excelDateToJSDate(undefined)).toBeNull();
    });
  });

  describe('parseDate', () => {
    describe('Excel serial numbers', () => {
      it('should parse Excel serial number', () => {
        const result = parseDate(44927); // Jan 1, 2023
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2023);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(1);
      });
    });

    describe('ISO format (yyyy-mm-dd)', () => {
      it('should parse ISO format with leading zeros', () => {
        const result = parseDate('2024-03-05');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(2);
        expect(result.getDate()).toBe(5);
      });

      it('should parse ISO format without leading zeros', () => {
        const result = parseDate('2024-3-5');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(2);
        expect(result.getDate()).toBe(5);
      });
    });

    describe('dd/mm/yyyy format', () => {
      it('should parse dd/mm/yyyy with leading zeros', () => {
        const result = parseDate('05/03/2024');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(2); // March
        expect(result.getDate()).toBe(5);
      });

      it('should parse dd/mm/yyyy without leading zeros', () => {
        const result = parseDate('5/3/2024');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(2);
        expect(result.getDate()).toBe(5);
      });
    });

    describe('dd-mm-yyyy format', () => {
      it('should parse dd-mm-yyyy with leading zeros', () => {
        const result = parseDate('05-03-2024');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(2);
        expect(result.getDate()).toBe(5);
      });

      it('should parse dd-mm-yyyy without leading zeros', () => {
        const result = parseDate('5-3-2024');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(2);
        expect(result.getDate()).toBe(5);
      });
    });

    describe('yyyy/mm/dd format', () => {
      it('should parse yyyy/mm/dd format', () => {
        const result = parseDate('2024/03/05');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(2);
        expect(result.getDate()).toBe(5);
      });
    });

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(parseDate('')).toBeNull();
      });

      it('should return null for null', () => {
        expect(parseDate(null)).toBeNull();
      });

      it('should return null for undefined', () => {
        expect(parseDate(undefined)).toBeNull();
      });

      it('should return null for invalid format', () => {
        expect(parseDate('not-a-date')).toBeNull();
      });

      it('should handle whitespace in string dates', () => {
        const result = parseDate('  2024-03-05  ');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
      });
    });
  });

  describe('formatDateAsISO', () => {
    it('should format date as yyyy-mm-dd', () => {
      const date = new Date(2024, 2, 5); // March 5, 2024
      expect(formatDateAsISO(date)).toBe('2024-03-05');
    });

    it('should pad single-digit month and day with zeros', () => {
      const date = new Date(2024, 0, 1); // January 1, 2024
      expect(formatDateAsISO(date)).toBe('2024-01-01');
    });

    it('should handle December correctly', () => {
      const date = new Date(2024, 11, 25); // December 25, 2024
      expect(formatDateAsISO(date)).toBe('2024-12-25');
    });

    it('should handle end of month dates', () => {
      const date = new Date(2024, 1, 29); // Feb 29, 2024 (leap year)
      expect(formatDateAsISO(date)).toBe('2024-02-29');
    });
  });

  describe('normalizeDatesInTable2', () => {
    it('should convert Excel serial dates to ISO format', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', 44927, 'Round #1'], // Jan 1, 2023
      ];

      normalizeDatesInTable2(table2Data);

      expect(table2Data[1][2]).toBe('2023-01-01');
    });

    it('should convert dd/mm/yyyy to ISO format', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '15/03/2024', 'Round #1'],
      ];

      normalizeDatesInTable2(table2Data);

      expect(table2Data[1][2]).toBe('2024-03-15');
    });

    it('should keep ISO format dates unchanged', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-03-15', 'Round #1'],
      ];

      normalizeDatesInTable2(table2Data);

      expect(table2Data[1][2]).toBe('2024-03-15');
    });

    it('should handle mixed date formats', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-03-15', 'Round #1'],
        ['c@test.com', 'd@test.com', '20/04/2024', 'Round #2'],
        ['e@test.com', 'f@test.com', 45366, 'Round #3'], // March 15, 2024
      ];

      normalizeDatesInTable2(table2Data);

      expect(table2Data[1][2]).toBe('2024-03-15');
      expect(table2Data[2][2]).toBe('2024-04-20');
      expect(table2Data[3][2]).toBe('2024-03-15');
    });

    it('should skip rows without date column', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', null, 'Round #1'],
        ['c@test.com', 'd@test.com', '', 'Round #2'],
      ];

      normalizeDatesInTable2(table2Data);

      expect(table2Data[1][2]).toBeNull();
      expect(table2Data[2][2]).toBe('');
    });

    it('should skip empty or undefined rows', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        null,
        undefined,
        ['a@test.com', 'b@test.com', '2024-03-15', 'Round #1'],
      ];

      normalizeDatesInTable2(table2Data);

      expect(table2Data[1]).toBeNull();
      expect(table2Data[2]).toBeUndefined();
      expect(table2Data[3][2]).toBe('2024-03-15');
    });
  });

  describe('removeEmptyRows', () => {
    it('should remove rows without email1 and email2', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-03-15', 'Round #1'],
        ['', '', '', ''],
        ['c@test.com', 'd@test.com', '2024-03-16', 'Round #2'],
      ];

      const result = removeEmptyRows(table2Data);

      expect(result.length).toBe(3); // header + 2 valid rows
      expect(result[0]).toEqual(['email1', 'email2', 'date', 'text']);
      expect(result[1][0]).toBe('a@test.com');
      expect(result[2][0]).toBe('c@test.com');
    });

    it('should remove null and undefined rows', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        null,
        undefined,
        ['a@test.com', 'b@test.com', '2024-03-15', 'Round #1'],
      ];

      const result = removeEmptyRows(table2Data);

      expect(result.length).toBe(2);
      expect(result[1][0]).toBe('a@test.com');
    });

    it('should preserve rows with only email1', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', '', '', ''], // has email1 but not email2
        ['b@test.com', 'c@test.com', '', ''],
      ];

      const result = removeEmptyRows(table2Data);

      // Row with only email1 is filtered out (needs both email1 AND email2)
      expect(result.length).toBe(2);
      expect(result[1][0]).toBe('b@test.com');
    });

    it('should return original data for empty input', () => {
      expect(removeEmptyRows([])).toEqual([]);
      expect(removeEmptyRows(null)).toBeNull();
      expect(removeEmptyRows(undefined)).toBeUndefined();
    });

    it('should keep header row even if data rows are empty', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['', '', '', ''],
      ];

      const result = removeEmptyRows(table2Data);

      expect(result.length).toBe(1);
      expect(result[0]).toEqual(['email1', 'email2', 'date', 'text']);
    });
  });

  describe('detectNextRoundNumber', () => {
    it('should return 1 when no rounds exist', () => {
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const result = detectNextRoundNumber(table2Data, 'Random Coffee');

      expect(result).toBe(1);
    });

    it('should return next round number after highest found', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Random Coffee #1'],
        ['c@test.com', 'd@test.com', '2024-02-15', 'Random Coffee #2'],
        ['e@test.com', 'f@test.com', '2024-03-15', 'Random Coffee #3'],
      ];

      const result = detectNextRoundNumber(table2Data, 'Random Coffee');

      expect(result).toBe(4);
    });

    it('should handle non-sequential round numbers', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Random Coffee #5'],
        ['c@test.com', 'd@test.com', '2024-02-15', 'Random Coffee #1'],
        ['e@test.com', 'f@test.com', '2024-03-15', 'Random Coffee #3'],
      ];

      const result = detectNextRoundNumber(table2Data, 'Random Coffee');

      expect(result).toBe(6); // After highest (5)
    });

    it('should handle custom base text', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Team Coffee #7'],
      ];

      const result = detectNextRoundNumber(table2Data, 'Team Coffee');

      expect(result).toBe(8);
    });

    it('should be case insensitive', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'RANDOM COFFEE #5'],
        ['c@test.com', 'd@test.com', '2024-02-15', 'random coffee #3'],
      ];

      const result = detectNextRoundNumber(table2Data, 'Random Coffee');

      expect(result).toBe(6);
    });

    it('should handle base text with special regex characters', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Coffee (Team) #4'],
      ];

      const result = detectNextRoundNumber(table2Data, 'Coffee (Team)');

      expect(result).toBe(5);
    });

    it('should skip rows without text column', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', null],
        ['c@test.com', 'd@test.com', '2024-02-15', 'Random Coffee #2'],
      ];

      const result = detectNextRoundNumber(table2Data, 'Random Coffee');

      expect(result).toBe(3);
    });

    it('should skip null and undefined rows', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        null,
        undefined,
        ['a@test.com', 'b@test.com', '2024-01-15', 'Random Coffee #5'],
      ];

      const result = detectNextRoundNumber(table2Data, 'Random Coffee');

      expect(result).toBe(6);
    });

    it('should handle whitespace variations in pattern', () => {
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Random Coffee#3'], // no space
        ['c@test.com', 'd@test.com', '2024-02-15', 'Random Coffee  #5'], // double space
      ];

      const result = detectNextRoundNumber(table2Data, 'Random Coffee');

      // Pattern uses \s* which matches 0+ whitespace
      expect(result).toBe(6);
    });
  });
});
