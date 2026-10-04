const axios = require('axios');
const fs = require('fs');

class YandexDiskClient {
  constructor(oauthToken) {
    this.oauthToken = oauthToken;
    this.baseURL = 'https://cloud-api.yandex.net/v1/disk';
  }

  /**
   * Download a file from Yandex.Disk
   * @param {string} remotePath - Path to file on Yandex.Disk (e.g., '/spreadsheet.xlsx')
   * @param {string} localPath - Local path to save the file
   * @returns {Promise<string>} - The local path the file was saved to
   */
  async downloadFile(remotePath, localPath) {
    try {
      const downloadUrl = await this.#requestTransferUrl('download', { path: remotePath });
      const { data } = await axios.get(downloadUrl, { responseType: 'arraybuffer' });

      fs.writeFileSync(localPath, data);
      console.log(`File downloaded successfully to ${localPath}`);
      return localPath;
    } catch (error) {
      throw toApiError(error);
    }
  }

  /**
   * Upload a file to Yandex.Disk
   * @param {string} localPath - Local file path
   * @param {string} remotePath - Path on Yandex.Disk where to upload
   * @param {boolean} overwrite - Whether to overwrite existing file
   */
  async uploadFile(localPath, remotePath, overwrite = true) {
    try {
      const uploadUrl = await this.#requestTransferUrl('upload', { path: remotePath, overwrite });

      await axios.put(uploadUrl, fs.readFileSync(localPath), {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      console.log(`File uploaded successfully to ${remotePath}`);
    } catch (error) {
      throw toApiError(error);
    }
  }

  /**
   * Request a one-time URL for transferring a file to or from Yandex.Disk
   * @param {'download'|'upload'} operation
   * @param {object} params - Query parameters for the API call
   * @returns {Promise<string>} - URL to download from or upload to
   */
  async #requestTransferUrl(operation, params) {
    const response = await axios.get(`${this.baseURL}/resources/${operation}`, {
      headers: { Authorization: `OAuth ${this.oauthToken}` },
      params,
    });
    return response.data.href;
  }
}

/**
 * Convert an HTTP error response into a readable Yandex.Disk API error
 */
function toApiError(error) {
  if (!error.response) return error;

  const { status, statusText, data } = error.response;
  return new Error(`Yandex.Disk API error: ${status} - ${data?.message || statusText}`);
}

module.exports = YandexDiskClient;
