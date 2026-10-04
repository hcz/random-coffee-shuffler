import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('config', () => {
  // Store original env so we can restore it
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('yandexDisk config', () => {
    it('should load oauthToken from environment', () => {
      const config = require('./config');
      // Just verify the structure exists (value comes from actual .env)
      expect(config.yandexDisk).toHaveProperty('oauthToken');
    });

    it('should have filePath property', () => {
      const config = require('./config');
      expect(config.yandexDisk).toHaveProperty('filePath');
      // Default is '/RandomCoffee.xlsx' or custom from env
      expect(typeof config.yandexDisk.filePath).toBe('string');
    });
  });

  describe('spreadsheet config', () => {
    it('should have employeesSheetName property', () => {
      const config = require('./config');
      expect(config.spreadsheet).toHaveProperty('employeesSheetName');
      expect(typeof config.spreadsheet.employeesSheetName).toBe('string');
    });

    it('should have historySheetName property', () => {
      const config = require('./config');
      expect(config.spreadsheet).toHaveProperty('historySheetName');
      expect(typeof config.spreadsheet.historySheetName).toBe('string');
    });

    it('should have roundLabelPrefix property', () => {
      const config = require('./config');
      expect(config.spreadsheet).toHaveProperty('roundLabelPrefix');
      expect(typeof config.spreadsheet.roundLabelPrefix).toBe('string');
    });
  });

  describe('localFile config', () => {
    it('should have downloadPath set to temp file', () => {
      const config = require('./config');
      expect(config.localFile.downloadPath).toBe('./temp_spreadsheet.xlsx');
    });
  });

  describe('config structure completeness', () => {
    it('should have all required yandexDisk properties', () => {
      const config = require('./config');
      expect(config.yandexDisk).toBeDefined();
      expect(typeof config.yandexDisk.oauthToken === 'string' || config.yandexDisk.oauthToken === undefined).toBe(true);
      expect(typeof config.yandexDisk.filePath).toBe('string');
    });

    it('should have all required spreadsheet properties', () => {
      const config = require('./config');
      expect(config.spreadsheet).toBeDefined();
      expect(typeof config.spreadsheet.employeesSheetName).toBe('string');
      expect(typeof config.spreadsheet.historySheetName).toBe('string');
      expect(typeof config.spreadsheet.roundLabelPrefix).toBe('string');
    });

    it('should have all required localFile properties', () => {
      const config = require('./config');
      expect(config.localFile).toBeDefined();
      expect(typeof config.localFile.downloadPath).toBe('string');
      expect(config.localFile.downloadPath).toContain('.xlsx');
    });
  });
});
