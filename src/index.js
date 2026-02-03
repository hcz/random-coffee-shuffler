const XLSX = require('xlsx');
const fs = require('fs');
const config = require('./config');
const YandexDiskClient = require('./yandexDiskClient');
const { generateOptimalPairs } = require('./pairingAlgorithm');

/**
 * Main function to process the spreadsheet
 */
async function main() {
  try {
    console.log('Starting Random Coffee pairing process...\n');

    // Validate configuration
    if (!config.yandexDisk.oauthToken) {
      throw new Error('YANDEX_OAUTH_TOKEN is not set in .env file');
    }

    // Initialize Yandex.Disk client
    const yandexClient = new YandexDiskClient(config.yandexDisk.oauthToken);

    // Step 1: Download spreadsheet from Yandex.Disk
    console.log('Step 1: Downloading spreadsheet from Yandex.Disk...');
    await yandexClient.downloadFile(
      config.yandexDisk.filePath,
      config.localFile.downloadPath
    );

    // Step 2: Read the spreadsheet
    console.log('\nStep 2: Reading spreadsheet...');
    const workbook = XLSX.readFile(config.localFile.downloadPath);

    // Get sheets
    const sheet1Name = config.spreadsheet.sheet1Name;
    const sheet2Name = config.spreadsheet.sheet2Name;

    if (!workbook.Sheets[sheet1Name]) {
      throw new Error(`Sheet "${sheet1Name}" not found in workbook`);
    }
    if (!workbook.Sheets[sheet2Name]) {
      throw new Error(`Sheet "${sheet2Name}" not found in workbook`);
    }

    const sheet1 = workbook.Sheets[sheet1Name];
    const sheet2 = workbook.Sheets[sheet2Name];

    // Convert sheets to JSON arrays
    const table1Data = XLSX.utils.sheet_to_json(sheet1, { header: 1 });
    let table2Data = XLSX.utils.sheet_to_json(sheet2, { header: 1 });

    console.log(`Table 1 has ${table1Data.length} rows`);

    // Normalize all dates in Table 2 to dd/mm/yyyy format
    normalizeDatesInTable2(table2Data);

    // Remove empty rows from Table 2
    const rowsBeforeCleanup = table2Data.length;
    table2Data = removeEmptyRows(table2Data);
    const emptyRowsRemoved = rowsBeforeCleanup - table2Data.length;
    if (emptyRowsRemoved > 0) {
      console.log(`Table 2: Removed ${emptyRowsRemoved} empty row(s), now has ${table2Data.length} rows`);
    } else {
      console.log(`Table 2 has ${table2Data.length} rows`);
    }

    // Step 3: Generate optimal pairs using sophisticated algorithm
    const newPairs = generateOptimalPairs(
      table1Data,
      table2Data
    );

    if (newPairs.length === 0) {
      console.log('\nNo new pairs to add. Exiting.');
      // Clean up temp file
      fs.unlinkSync(config.localFile.downloadPath);
      return;
    }

    // Step 4: Append new pairs to Table 2
    console.log('\nStep 4: Appending new pairs to Table 2...');

    // Detect next round number
    const roundNumber = detectNextRoundNumber(table2Data, config.spreadsheet.pairingTextBase);
    const pairingText = `${config.spreadsheet.pairingTextBase} #${roundNumber}`;
    console.log(`  Round: ${pairingText}`);

    // Get current date formatted as ISO (yyyy-mm-dd) - the ONLY date format we use for writing
    const currentDate = new Date();
    const dateText = formatDateAsISO(currentDate);

    // Add new pairs to table2Data
    // Table 2 structure: Column 0 = email1, Column 1 = email2, Column 2 = date (yyyy-mm-dd), Column 3 = text
    for (const [email1, email2] of newPairs) {
      const newRow = [
        email1,
        email2,
        dateText, // Date in ISO format yyyy-mm-dd
        pairingText,
      ];
      table2Data.push(newRow);
      console.log(`${email1} - ${email2}`);
    }

    // Convert updated data back to worksheet
    const newSheet2 = XLSX.utils.aoa_to_sheet(table2Data);

    // Update workbook
    workbook.Sheets[sheet2Name] = newSheet2;

    // Write updated workbook to file
    XLSX.writeFile(workbook, config.localFile.downloadPath);
    console.log('\nSpreadsheet updated locally');

    // Step 5: Upload updated spreadsheet back to Yandex.Disk
    console.log('\nStep 5: Uploading updated spreadsheet to Yandex.Disk...');
    await yandexClient.uploadFile(
      config.localFile.downloadPath,
      config.yandexDisk.filePath,
      true
    );

    console.log('\n✓ Process completed successfully!');
    console.log(`✓ Added ${newPairs.length} new pairs to the spreadsheet`);

    // Clean up temp file
    fs.unlinkSync(config.localFile.downloadPath);
    console.log('✓ Temporary file cleaned up');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error(error.stack);

    // Clean up temp file if it exists
    if (fs.existsSync(config.localFile.downloadPath)) {
      fs.unlinkSync(config.localFile.downloadPath);
    }

    process.exit(1);
  }
}

/**
 * Convert Excel serial date to JavaScript Date
 */
function excelDateToJSDate(serial) {
  if (typeof serial !== 'number') return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

/**
 * Parse date from various formats
 * Accepts: Excel serial numbers, dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy, and other common formats
 * Output: All dates will be written in ISO format (yyyy-mm-dd)
 * @param {number|string} dateValue - Date in any common format
 * @returns {Date|null} - Parsed date or null
 */
function parseDate(dateValue) {
  if (!dateValue) return null;

  // Excel serial number
  if (typeof dateValue === 'number') {
    return excelDateToJSDate(dateValue);
  }

  // String formats
  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();

    // Try ISO format yyyy-mm-dd (e.g., "2024-03-05")
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1; // months are 0-indexed
      const day = parseInt(isoMatch[3], 10);
      return new Date(year, month, day);
    }

    // Try dd/mm/yyyy format (e.g., "05/03/2024" = March 5, 2024)
    const ddmmyyyySlashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyySlashMatch) {
      const day = parseInt(ddmmyyyySlashMatch[1], 10);
      const month = parseInt(ddmmyyyySlashMatch[2], 10) - 1;
      const year = parseInt(ddmmyyyySlashMatch[3], 10);
      return new Date(year, month, day);
    }

    // Try dd-mm-yyyy format (e.g., "05-03-2024" = March 5, 2024)
    const ddmmyyyyDashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyyDashMatch) {
      const day = parseInt(ddmmyyyyDashMatch[1], 10);
      const month = parseInt(ddmmyyyyDashMatch[2], 10) - 1;
      const year = parseInt(ddmmyyyyDashMatch[3], 10);
      return new Date(year, month, day);
    }

    // Try yyyy/mm/dd format (e.g., "2024/03/05")
    const yyyymmddSlashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (yyyymmddSlashMatch) {
      const year = parseInt(yyyymmddSlashMatch[1], 10);
      const month = parseInt(yyyymmddSlashMatch[2], 10) - 1;
      const day = parseInt(yyyymmddSlashMatch[3], 10);
      return new Date(year, month, day);
    }

    // No valid format found
    console.warn(`Unable to parse date: "${dateValue}" - expected dd/mm/yyyy, yyyy-mm-dd, or similar format`);
    return null;
  }

  return null;
}

/**
 * Format date as ISO format (yyyy-mm-dd)
 * IMPORTANT: This is the ONLY date format used for writing dates in the History spreadsheet
 * ISO format is unambiguous, internationally standardized, and sorts correctly
 * @param {Date} date - JavaScript Date object
 * @returns {string} - Date string in yyyy-mm-dd format
 */
function formatDateAsISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalize all dates in Table 2 (History) to ISO format (yyyy-mm-dd)
 * Converts Excel serial numbers, dd/mm/yyyy, and other formats to consistent ISO format
 * This ensures ALL dates in the system use the same format for storage
 * @param {Array} table2Data - Historical pairing data (Table 2)
 */
function normalizeDatesInTable2(table2Data) {
  let normalized = 0;
  let alreadyCorrect = 0;
  let failed = 0;

  // Skip header row, process data rows
  for (let i = 1; i < table2Data.length; i++) {
    const row = table2Data[i];
    if (!row || !row[2]) continue; // Column 2 is the date column

    const dateValue = row[2];
    const originalValue = dateValue;

    // Parse the date from any format (Excel serial, dd/mm/yyyy, ISO, etc.)
    const parsedDate = parseDate(dateValue);

    // Convert to ISO format yyyy-mm-dd (the ONLY format we use for writing)
    if (parsedDate) {
      const formatted = formatDateAsISO(parsedDate);
      if (originalValue !== formatted) {
        normalized++;
      } else {
        alreadyCorrect++;
      }
      row[2] = formatted;
    } else {
      failed++;
    }
  }

  if (normalized > 0 || failed > 0) {
    console.log(`Date normalization: ${normalized} converted to ISO format, ${alreadyCorrect} already correct, ${failed} failed`);
  }
}

/**
 * Remove empty rows from Table 2
 * A row is considered empty if it lacks email1 and email2
 * @param {Array} table2Data - Historical pairing data
 * @returns {Array} - Cleaned table data without empty rows
 */
function removeEmptyRows(table2Data) {
  if (!table2Data || table2Data.length === 0) return table2Data;

  // Keep the header row (index 0) and filter data rows
  const header = table2Data[0];
  const dataRows = table2Data.slice(1).filter(row => {
    // A row is valid if it has at least email1 and email2
    return row && row[0] && row[1];
  });

  return [header, ...dataRows];
}

/**
 * Detect the current round number from existing table data
 * Looks for patterns like "Random Coffee #N" in the text column
 * @param {Array} table2Data - Historical pairing data
 * @param {string} baseText - Base text pattern (e.g., "Random Coffee")
 * @returns {number} - Next round number
 */
function detectNextRoundNumber(table2Data, baseText) {
  let maxRound = 0;

  // Regex to match "Base Text #N" pattern
  const pattern = new RegExp(`${baseText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*#(\\d+)`, 'i');

  for (let i = 1; i < table2Data.length; i++) {
    const row = table2Data[i];
    if (!row || !row[3]) continue; // Column 3 is text field

    const textValue = String(row[3]);
    const match = textValue.match(pattern);

    if (match && match[1]) {
      const roundNum = parseInt(match[1], 10);
      maxRound = Math.max(maxRound, roundNum);
    }
  }

  return maxRound + 1;
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  main,
  excelDateToJSDate,
  parseDate,
  formatDateAsISO,
  normalizeDatesInTable2,
  removeEmptyRows,
  detectNextRoundNumber,
};
