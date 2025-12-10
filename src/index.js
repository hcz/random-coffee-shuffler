const XLSX = require('xlsx');
const fs = require('fs');
const config = require('./config');
const YandexDiskClient = require('./yandexDiskClient');
const { generateOptimalPairs } = require('./sophisticatedPairingAlgorithm');

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
    const table2Data = XLSX.utils.sheet_to_json(sheet2, { header: 1 });

    console.log(`Table 1 has ${table1Data.length} rows`);
    console.log(`Table 2 has ${table2Data.length} rows`);

    // Normalize all dates in Table 2 to dd/mm/yyyy format
    normalizeDatesInTable2(table2Data);

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

    // Get current date formatted as dd/mm/yyyy
    const currentDate = new Date();
    const dateText = formatDateAsDDMMYYYY(currentDate);

    // Add new pairs to table2Data
    // Table 2 structure: Column 0 = email1, Column 1 = email2, Column 2 = date, Column 3 = text
    for (const [email1, email2] of newPairs) {
      const newRow = [
        email1,
        email2,
        dateText,
        pairingText,
      ];
      table2Data.push(newRow);
      console.log(`  Added pair: ${email1} - ${email2}`);
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
 * Parse date from various formats (Excel serial, dd/mm/yyyy text, ISO string)
 * @param {number|string} dateValue - Date in any format
 * @returns {Date|null} - Parsed date or null
 */
function parseDate(dateValue) {
  if (!dateValue) return null;

  // Excel serial number
  if (typeof dateValue === 'number') {
    return excelDateToJSDate(dateValue);
  }

  // Text date in dd/mm/yyyy format
  if (typeof dateValue === 'string') {
    // Try dd/mm/yyyy format first
    const ddmmyyyyMatch = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1], 10);
      const month = parseInt(ddmmyyyyMatch[2], 10) - 1; // months are 0-indexed
      const year = parseInt(ddmmyyyyMatch[3], 10);
      return new Date(year, month, day);
    }

    // Fallback to standard Date parsing (handles ISO format, etc.)
    const parsed = new Date(dateValue);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Format date as dd/mm/yyyy text string
 * @param {Date} date
 * @returns {string}
 */
function formatDateAsDDMMYYYY(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-indexed
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Normalize all dates in Table 2 to dd/mm/yyyy format
 * Converts Excel serial numbers and other formats to consistent text format
 * @param {Array} table2Data - Historical pairing data
 */
function normalizeDatesInTable2(table2Data) {
  // Skip header row, process data rows
  for (let i = 1; i < table2Data.length; i++) {
    const row = table2Data[i];
    if (!row || !row[2]) continue; // Column 2 is the date column

    const dateValue = row[2];

    // Parse the date from any format
    const parsedDate = parseDate(dateValue);

    // Convert to dd/mm/yyyy text format
    if (parsedDate) {
      row[2] = formatDateAsDDMMYYYY(parsedDate);
    }
  }
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

module.exports = { main };
