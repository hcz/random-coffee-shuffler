import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('YandexDiskClient', () => {
  const testToken = 'test-oauth-token';

  describe('constructor', () => {
    it('should initialize with OAuth token', () => {
      const YandexDiskClient = require('./yandexDiskClient');
      const client = new YandexDiskClient(testToken);
      expect(client.oauthToken).toBe(testToken);
    });

    it('should set correct base URL', () => {
      const YandexDiskClient = require('./yandexDiskClient');
      const client = new YandexDiskClient(testToken);
      expect(client.baseURL).toBe('https://cloud-api.yandex.net/v1/disk');
    });
  });

  describe('downloadFile method', () => {
    it('should be a function', () => {
      const YandexDiskClient = require('./yandexDiskClient');
      const client = new YandexDiskClient(testToken);
      expect(typeof client.downloadFile).toBe('function');
    });
  });

  describe('uploadFile method', () => {
    it('should be a function', () => {
      const YandexDiskClient = require('./yandexDiskClient');
      const client = new YandexDiskClient(testToken);
      expect(typeof client.uploadFile).toBe('function');
    });
  });

  describe('error handling structure', () => {
    it('should throw formatted error on API failure with response', async () => {
      const YandexDiskClient = require('./yandexDiskClient');
      const client = new YandexDiskClient('invalid-token');

      // This test verifies the error handling works when API call fails
      // It makes a real call which will fail due to invalid token
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        await client.downloadFile('/test.xlsx', '/tmp/test.xlsx');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Error should be formatted as expected
        expect(error.message).toContain('Yandex.Disk API error:');
      }
    });
  });
});
