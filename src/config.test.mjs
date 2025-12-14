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
    it('should have sheet1Name property', () => {
      const config = require('./config');
      expect(config.spreadsheet).toHaveProperty('sheet1Name');
      expect(typeof config.spreadsheet.sheet1Name).toBe('string');
    });

    it('should have sheet2Name property', () => {
      const config = require('./config');
      expect(config.spreadsheet).toHaveProperty('sheet2Name');
      expect(typeof config.spreadsheet.sheet2Name).toBe('string');
    });

    it('should have pairingTextBase property', () => {
      const config = require('./config');
      expect(config.spreadsheet).toHaveProperty('pairingTextBase');
      expect(typeof config.spreadsheet.pairingTextBase).toBe('string');
    });

    it('should have historyCheckDays as a number', () => {
      const config = require('./config');
      expect(config.spreadsheet).toHaveProperty('historyCheckDays');
      expect(typeof config.spreadsheet.historyCheckDays).toBe('number');
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
      expect(typeof config.spreadsheet.sheet1Name).toBe('string');
      expect(typeof config.spreadsheet.sheet2Name).toBe('string');
      expect(typeof config.spreadsheet.pairingTextBase).toBe('string');
      expect(typeof config.spreadsheet.historyCheckDays).toBe('number');
      expect(config.spreadsheet.historyCheckDays).toBeGreaterThan(0);
    });

    it('should have all required localFile properties', () => {
      const config = require('./config');
      expect(config.localFile).toBeDefined();
      expect(typeof config.localFile.downloadPath).toBe('string');
      expect(config.localFile.downloadPath).toContain('.xlsx');
    });
  });
});
