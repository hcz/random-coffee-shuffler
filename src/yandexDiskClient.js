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
   */
  async downloadFile(remotePath, localPath) {
    try {
      // Get download link
      const response = await axios.get(`${this.baseURL}/resources/download`, {
        headers: {
          Authorization: `OAuth ${this.oauthToken}`,
        },
        params: {
          path: remotePath,
        },
      });

      const downloadURL = response.data.href;

      // Download file
      const fileResponse = await axios.get(downloadURL, {
        responseType: 'arraybuffer',
      });

      // Save to local file
      fs.writeFileSync(localPath, fileResponse.data);
      console.log(`File downloaded successfully to ${localPath}`);
      return localPath;
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Yandex.Disk API error: ${error.response.status} - ${
            error.response.data.message || error.response.statusText
          }`
        );
      }
      throw error;
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
      // Get upload link
      const response = await axios.get(`${this.baseURL}/resources/upload`, {
        headers: {
          Authorization: `OAuth ${this.oauthToken}`,
        },
        params: {
          path: remotePath,
          overwrite: overwrite,
        },
      });

      const uploadURL = response.data.href;

      // Read local file
      const fileBuffer = fs.readFileSync(localPath);

      // Upload file
      await axios.put(uploadURL, fileBuffer, {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      console.log(`File uploaded successfully to ${remotePath}`);
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Yandex.Disk API error: ${error.response.status} - ${
            error.response.data.message || error.response.statusText
          }`
        );
      }
      throw error;
    }
  }
}

module.exports = YandexDiskClient;
