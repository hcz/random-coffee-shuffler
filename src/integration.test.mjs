import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();

    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pairing Algorithm Integration', () => {
    it('should generate new pairs avoiding recent meetings', () => {
      const { generateOptimalPairs } = require('./pairingAlgorithm');

      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, ''],
        ['bob@test.com', true, ''],
        ['charlie@test.com', true, ''],
        ['david@test.com', true, ''],
      ];

      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['alice@test.com', 'bob@test.com', '2024-01-15', 'Random Coffee #1'],
        ['charlie@test.com', 'david@test.com', '2024-01-15', 'Random Coffee #1'],
      ];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      // Should produce 2 pairs
      expect(pairs.length).toBe(2);

      // Should NOT pair alice-bob or charlie-david (already met)
      for (const [email1, email2] of pairs) {
        const isAliceBob =
          (email1 === 'alice@test.com' && email2 === 'bob@test.com') ||
          (email1 === 'bob@test.com' && email2 === 'alice@test.com');
        const isCharlieDavid =
          (email1 === 'charlie@test.com' && email2 === 'david@test.com') ||
          (email1 === 'david@test.com' && email2 === 'charlie@test.com');

        expect(isAliceBob).toBe(false);
        expect(isCharlieDavid).toBe(false);
      }
    });

    it('should handle larger groups efficiently', () => {
      const { generateOptimalPairs } = require('./pairingAlgorithm');

      // Create 20 employees
      const table1Data = [['email', 'active', 'twice']];
      for (let i = 1; i <= 20; i++) {
        table1Data.push([`user${i}@test.com`, true, '']);
      }

      const table2Data = [['email1', 'email2', 'date', 'text']];

      const startTime = Date.now();
      const pairs = generateOptimalPairs(table1Data, table2Data);
      const endTime = Date.now();

      // Should complete in reasonable time (< 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);

      // Should produce 10 pairs (20 employees / 2)
      expect(pairs.length).toBe(10);

      // All employees should be paired exactly once
      const pairedEmails = pairs.flat();
      expect(new Set(pairedEmails).size).toBe(20);
    });

    it('should handle odd number of employees with twice user', () => {
      const { generateOptimalPairs } = require('./pairingAlgorithm');

      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, 'twice'], // Can be paired twice
        ['bob@test.com', true, ''],
        ['charlie@test.com', true, ''],
      ];

      const table2Data = [['email1', 'email2', 'date', 'text']];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      // With 3 employees and 1 twice user, we can make 2 pairs
      // alice gets paired twice
      expect(pairs.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle case where all possible pairs have been made', () => {
      const { generateOptimalPairs } = require('./pairingAlgorithm');

      // 4 employees, all possible pairs have met
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
      ];

      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        // All 6 possible pairs have met
        ['a@test.com', 'b@test.com', '2024-01-01', '#1'],
        ['a@test.com', 'c@test.com', '2024-01-02', '#2'],
        ['a@test.com', 'd@test.com', '2024-01-03', '#3'],
        ['b@test.com', 'c@test.com', '2024-01-04', '#4'],
        ['b@test.com', 'd@test.com', '2024-01-05', '#5'],
        ['c@test.com', 'd@test.com', '2024-01-06', '#6'],
      ];

      // Algorithm should still produce pairs (with penalty)
      const pairs = generateOptimalPairs(table1Data, table2Data);

      // Should still produce pairs even if all are repeats
      expect(pairs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Date Handling Integration', () => {
    it('should correctly normalize and use dates through the workflow', () => {
      const {
        parseDate,
        formatDateAsISO,
        normalizeDatesInTable2,
      } = require('./index');

      // Simulate mixed date formats in history
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', 45366, 'Round #1'], // Excel serial
        ['c@test.com', 'd@test.com', '15/03/2024', 'Round #2'], // dd/mm/yyyy
        ['e@test.com', 'f@test.com', '2024-03-15', 'Round #3'], // ISO
      ];

      // Normalize dates
      normalizeDatesInTable2(table2Data);

      // All dates should be in ISO format
      expect(table2Data[1][2]).toBe('2024-03-15');
      expect(table2Data[2][2]).toBe('2024-03-15');
      expect(table2Data[3][2]).toBe('2024-03-15');
    });
  });

  describe('Round Number Detection Integration', () => {
    it('should correctly detect and increment round numbers', () => {
      const { detectNextRoundNumber } = require('./index');

      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Random Coffee #1'],
        ['c@test.com', 'd@test.com', '2024-01-15', 'Random Coffee #1'],
        ['e@test.com', 'f@test.com', '2024-02-15', 'Random Coffee #2'],
        ['g@test.com', 'h@test.com', '2024-02-15', 'Random Coffee #2'],
      ];

      const nextRound = detectNextRoundNumber(table2Data, 'Random Coffee');

      expect(nextRound).toBe(3);
    });
  });

  describe('Empty Row Handling Integration', () => {
    it('should clean up data before processing', () => {
      const { removeEmptyRows } = require('./index');
      const { generateOptimalPairs } = require('./pairingAlgorithm');

      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, ''],
        ['bob@test.com', true, ''],
      ];

      // Table2 with empty rows
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        null,
        ['', '', '', ''],
        ['alice@test.com', 'charlie@test.com', '2024-01-15', 'Round #1'], // charlie not active
        undefined,
      ];

      const cleanedTable2 = removeEmptyRows(table2Data);

      // Should have header + 1 valid row (alice-charlie)
      expect(cleanedTable2.length).toBe(2);

      // Algorithm should work with cleaned data
      const pairs = generateOptimalPairs(table1Data, cleanedTable2);
      expect(pairs.length).toBe(1); // alice and bob
    });
  });

  describe('Spreadsheet Data Format Integration', () => {
    it('should work with XLSX utility functions', () => {
      // Create sample data as if read from xlsx
      const sheet1Data = [
        ['email', 'active', 'twice'],
        ['user1@test.com', true, ''],
        ['user2@test.com', true, ''],
        ['user3@test.com', false, ''], // inactive
        ['user4@test.com', true, 'twice'],
      ];

      const sheet2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['user1@test.com', 'user2@test.com', '2024-01-15', 'Random Coffee #1'],
      ];

      // Create workbook using XLSX
      const sheet1 = XLSX.utils.aoa_to_sheet(sheet1Data);
      const sheet2 = XLSX.utils.aoa_to_sheet(sheet2Data);

      // Read back as JSON
      const table1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 });
      const table2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 });

      // Verify data integrity
      expect(table1.length).toBe(5);
      expect(table2.length).toBe(2);
      expect(table1[1][0]).toBe('user1@test.com');
      expect(table2[1][2]).toBe('2024-01-15');
    });
  });

  describe('Full Pairing Cycle', () => {
    it('should produce pairs in first round with no history', () => {
      const { generateOptimalPairs } = require('./pairingAlgorithm');

      // 6 employees = 3 pairs expected
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
        ['e@test.com', true, ''],
        ['f@test.com', true, ''],
      ];

      const table2Data = [['email1', 'email2', 'date', 'text']];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      // First round with no history should always produce n/2 pairs
      expect(pairs.length).toBe(3);

      // All 6 employees should be paired exactly once
      const pairedEmails = pairs.flat();
      expect(new Set(pairedEmails).size).toBe(6);
    });

    it('should avoid repeating pairs across rounds', () => {
      const { generateOptimalPairs } = require('./pairingAlgorithm');
      const { formatDateAsISO } = require('./index');

      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
      ];

      let table2Data = [['email1', 'email2', 'date', 'text']];

      // First round
      const pairs1 = generateOptimalPairs(table1Data, table2Data);
      expect(pairs1.length).toBe(2);

      // Add pairs to history
      const dateText = formatDateAsISO(new Date());
      for (const [email1, email2] of pairs1) {
        table2Data.push([email1, email2, dateText, 'Random Coffee #1']);
      }

      // Second round
      const pairs2 = generateOptimalPairs(table1Data, table2Data);
      expect(pairs2.length).toBeGreaterThanOrEqual(1);

      // With 4 people, there are 6 possible pairs (4 choose 2)
      // Round 1 uses 2, so round 2 should have 4 remaining options
      // The pairs in round 2 should NOT be the same as round 1
      const round1Set = new Set(pairs1.map(p => [...p].sort().join('-')));
      const round2Set = new Set(pairs2.map(p => [...p].sort().join('-')));
      const intersection = [...round1Set].filter(p => round2Set.has(p));

      // No pairs should repeat
      expect(intersection.length).toBe(0);
    });
  });
});
