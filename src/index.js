const XLSX = require('xlsx');
const fs = require('fs');
const config = require('./config');
const YandexDiskClient = require('./yandexDiskClient');
const { generatePairs } = require('./pairingAlgorithm');

// History sheet columns: email1 | email2 | date (yyyy-mm-dd) | round label
const HISTORY_DATE_COLUMN = 2;
const HISTORY_ROUND_COLUMN = 3;

// Days between the Excel epoch (1899-12-30) and the Unix epoch (1970-01-01)
const EXCEL_TO_UNIX_EPOCH_DAYS = 25569;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Accepted date formats: yyyy-mm-dd, yyyy/mm/dd, dd/mm/yyyy, dd-mm-yyyy
const YEAR_FIRST_DATE_PATTERN = /^(?<year>\d{4})(?<sep>[-/])(?<month>\d{1,2})\k<sep>(?<day>\d{1,2})$/;
const DAY_FIRST_DATE_PATTERN = /^(?<day>\d{1,2})(?<sep>[-/])(?<month>\d{1,2})\k<sep>(?<year>\d{4})$/;

/**
 * Download the spreadsheet, append a new round of pairs to the History sheet
 * and upload the result back to Yandex.Disk
 */
async function main() {
  const { yandexDisk, spreadsheet, localFile } = config;

  try {
    console.log('Starting Random Coffee pairing process...\n');

    if (!yandexDisk.oauthToken) {
      throw new Error('YANDEX_OAUTH_TOKEN is not set in .env file');
    }
    const diskClient = new YandexDiskClient(yandexDisk.oauthToken);

    console.log('Step 1: Downloading spreadsheet from Yandex.Disk...');
    await diskClient.downloadFile(yandexDisk.filePath, localFile.downloadPath);

    console.log('\nStep 2: Reading spreadsheet...');
    const workbook = XLSX.readFile(localFile.downloadPath);
    const employeeRows = readSheetRows(workbook, spreadsheet.employeesSheetName);
    const rawHistoryRows = readSheetRows(workbook, spreadsheet.historySheetName);
    console.log(`Employees sheet has ${employeeRows.length} rows`);

    normalizeHistoryDates(rawHistoryRows);
    const historyRows = removeIncompleteRows(rawHistoryRows);
    const removedRowCount = rawHistoryRows.length - historyRows.length;
    if (removedRowCount > 0) {
      console.log(`History sheet: Removed ${removedRowCount} empty row(s), now has ${historyRows.length} rows`);
    } else {
      console.log(`History sheet has ${historyRows.length} rows`);
    }

    // Step 3 is logged by the pairing algorithm itself
    const newPairs = generatePairs(employeeRows, historyRows);
    if (newPairs.length === 0) {
      console.log('\nNo new pairs to add. Exiting.');
      return;
    }

    console.log('\nStep 4: Appending new pairs to History sheet...');
    const roundNumber = detectNextRoundNumber(historyRows, spreadsheet.roundLabelPrefix);
    const roundLabel = `${spreadsheet.roundLabelPrefix} #${roundNumber}`;
    const today = formatIsoDate(new Date());
    console.log(`  Round: ${roundLabel}`);

    for (const [email1, email2] of newPairs) {
      historyRows.push([email1, email2, today, roundLabel]);
      console.log(`${email1} - ${email2}`);
    }

    workbook.Sheets[spreadsheet.historySheetName] = XLSX.utils.aoa_to_sheet(historyRows);
    XLSX.writeFile(workbook, localFile.downloadPath);
    console.log('\nSpreadsheet updated locally');

    console.log('\nStep 5: Uploading updated spreadsheet to Yandex.Disk...');
    await diskClient.uploadFile(localFile.downloadPath, yandexDisk.filePath);

    console.log('\n✓ Process completed successfully!');
    console.log(`✓ Added ${newPairs.length} new pairs to the spreadsheet`);
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    fs.rmSync(localFile.downloadPath, { force: true });
  }
}

/**
 * Read a worksheet as an array of rows (the first row is the header)
 * @throws {Error} If the workbook has no sheet with this name
 */
function readSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`);
  }
  return XLSX.utils.sheet_to_json(sheet, { header: 1 });
}

/**
 * Convert an Excel serial date number to a local-midnight Date
 * @param {number} serial - Days since the Excel epoch
 * @returns {Date|null} - Parsed date or null for non-numeric input
 */
function excelSerialToDate(serial) {
  if (typeof serial !== 'number') return null;

  const utcDate = new Date(Math.floor(serial - EXCEL_TO_UNIX_EPOCH_DAYS) * MS_PER_DAY);
  return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
}

/**
 * Parse a date from an Excel serial number or a yyyy-mm-dd, yyyy/mm/dd,
 * dd/mm/yyyy or dd-mm-yyyy string
 * @param {number|string} dateValue - Date in any supported format
 * @returns {Date|null} - Parsed date or null
 */
function parseDate(dateValue) {
  if (!dateValue) return null;

  if (typeof dateValue === 'number') {
    return excelSerialToDate(dateValue);
  }
  if (typeof dateValue !== 'string') return null;

  const trimmed = dateValue.trim();
  const match = trimmed.match(YEAR_FIRST_DATE_PATTERN) || trimmed.match(DAY_FIRST_DATE_PATTERN);
  if (!match) {
    console.warn(`Unable to parse date: "${dateValue}" - expected dd/mm/yyyy, yyyy-mm-dd, or similar format`);
    return null;
  }

  const { year, month, day } = match.groups;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/**
 * Format a date as yyyy-mm-dd, the only date format written to the History sheet
 * (unambiguous and sorts correctly as text)
 * @param {Date} date
 * @returns {string}
 */
function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Rewrite every date in the History sheet in place as yyyy-mm-dd
 * @param {Array} historyRows - History sheet rows, including the header
 */
function normalizeHistoryDates(historyRows) {
  let convertedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;

  for (const row of historyRows.slice(1)) {
    const dateValue = row?.[HISTORY_DATE_COLUMN];
    if (!dateValue) continue;

    const date = parseDate(dateValue);
    if (!date) {
      failedCount++;
      continue;
    }

    const isoDate = formatIsoDate(date);
    if (isoDate === dateValue) {
      unchangedCount++;
    } else {
      row[HISTORY_DATE_COLUMN] = isoDate;
      convertedCount++;
    }
  }

  if (convertedCount > 0 || failedCount > 0) {
    console.log(`Date normalization: ${convertedCount} converted to ISO format, ${unchangedCount} already correct, ${failedCount} failed`);
  }
}

/**
 * Drop History rows that do not contain both emails of a pair, keeping the header
 * @param {Array} historyRows - History sheet rows, including the header
 * @returns {Array} - Header followed by the complete rows only
 */
function removeIncompleteRows(historyRows) {
  if (!historyRows?.length) return historyRows;

  const [header, ...dataRows] = historyRows;
  return [header, ...dataRows.filter(row => row?.[0] && row?.[1])];
}

/**
 * Find the round that follows the highest "<prefix> #N" label in the History sheet
 * @param {Array} historyRows - History sheet rows, including the header
 * @param {string} roundLabelPrefix - Label text before the round number (e.g., "Random Coffee")
 * @returns {number} - Next round number (1 if no rounds were found)
 */
function detectNextRoundNumber(historyRows, roundLabelPrefix) {
  const roundLabelPattern = new RegExp(`${escapeRegExp(roundLabelPrefix)}\\s*#(\\d+)`, 'i');
  let lastRoundNumber = 0;

  for (const row of historyRows.slice(1)) {
    const match = String(row?.[HISTORY_ROUND_COLUMN] ?? '').match(roundLabelPattern);
    if (match) {
      lastRoundNumber = Math.max(lastRoundNumber, Number(match[1]));
    }
  }

  return lastRoundNumber + 1;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  excelSerialToDate,
  parseDate,
  formatIsoDate,
  normalizeHistoryDates,
  removeIncompleteRows,
  detectNextRoundNumber,
};
