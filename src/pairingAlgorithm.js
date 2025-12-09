/**
 * Pairing algorithm that creates pairs while avoiding recent pairings
 */

/**
 * Get recent pairs from history within the specified number of days
 * @param {Array} historyData - Array of rows from Table 2
 * @param {number} daysToCheck - Number of days to look back
 * @returns {Set} - Set of paired emails (formatted as "email1|email2")
 */
function getRecentPairs(historyData, daysToCheck) {
  const recentPairs = new Set();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToCheck);

  for (const row of historyData) {
    // Skip header row and empty rows
    if (!row || !row[1] || !row[2]) continue;

    const dateValue = row[3]; // Date column
    let rowDate;

    // Parse date (Excel dates can be serial numbers or date strings)
    if (typeof dateValue === 'number') {
      // Excel serial date
      rowDate = excelDateToJSDate(dateValue);
    } else if (dateValue) {
      rowDate = new Date(dateValue);
    }

    // Check if date is within the lookback period
    if (rowDate && rowDate >= cutoffDate) {
      const email1 = row[1];
      const email2 = row[2];

      // Store both orderings to catch duplicates regardless of order
      recentPairs.add(normalizeEmailPair(email1, email2));
    }
  }

  return recentPairs;
}

/**
 * Convert Excel serial date to JavaScript Date
 * @param {number} serial - Excel serial date
 * @returns {Date}
 */
function excelDateToJSDate(serial) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

/**
 * Normalize email pair to consistent format for comparison
 * @param {string} email1
 * @param {string} email2
 * @returns {string} - Sorted pair like "alice@ex.com|bob@ex.com"
 */
function normalizeEmailPair(email1, email2) {
  const emails = [email1.toLowerCase().trim(), email2.toLowerCase().trim()].sort();
  return emails.join('|');
}

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array
 * @returns {Array}
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Create pairs avoiding recent pairings
 * @param {Array} activeUsers - Array of active user objects {id, email}
 * @param {Set} recentPairs - Set of recent email pairs
 * @param {number} maxAttempts - Maximum shuffle attempts
 * @returns {Array} - Array of pairs [[user1, user2], ...]
 */
function createPairs(activeUsers, recentPairs, maxAttempts = 100) {
  if (activeUsers.length < 2) {
    console.log('Not enough active users to create pairs');
    return [];
  }

  let bestPairs = [];
  let bestConflicts = Infinity;

  // Try multiple random shuffles to find the best pairing
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffleArray(activeUsers);
    const pairs = [];
    let conflicts = 0;

    // Create pairs from shuffled list
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      const user1 = shuffled[i];
      const user2 = shuffled[i + 1];

      const pairKey = normalizeEmailPair(user1.email, user2.email);
      if (recentPairs.has(pairKey)) {
        conflicts++;
      }

      pairs.push([user1, user2]);
    }

    // Handle odd number of users (last user unpaired)
    if (shuffled.length % 2 !== 0) {
      // Option 1: Leave unpaired (could log or handle differently)
      console.log(`Note: User ${shuffled[shuffled.length - 1].email} will be unpaired (odd number of users)`);
    }

    // Keep the best result
    if (conflicts < bestConflicts) {
      bestConflicts = conflicts;
      bestPairs = pairs;

      // If we found a perfect solution, stop early
      if (conflicts === 0) {
        break;
      }
    }
  }

  if (bestConflicts > 0) {
    console.log(`Warning: ${bestConflicts} pair(s) have been paired recently. Consider adjusting history check period or shuffling manually.`);
  }

  return bestPairs;
}

/**
 * Main pairing function
 * @param {Array} table1Data - Data from Sheet 1 (users table)
 * @param {Array} table2Data - Data from Sheet 2 (pairings history)
 * @param {number} historyCheckDays - Number of days to check for recent pairs
 * @returns {Array} - New pairs to add to Table 2
 */
function generateNewPairs(table1Data, table2Data, historyCheckDays) {
  // Extract active users from Table 1 (skip header row)
  const activeUsers = [];

  for (let i = 1; i < table1Data.length; i++) {
    const row = table1Data[i];
    if (!row || !row[1]) continue; // Skip empty rows

    const id = row[0];
    const email = row[1];
    const isActive = row[2];

    // Only include active users (boolean true or string "true" or 1)
    if (isActive === true || isActive === 'true' || isActive === 1 || isActive === 'TRUE') {
      activeUsers.push({ id, email });
    }
  }

  console.log(`Found ${activeUsers.length} active users`);

  // Get recent pairs from history
  const recentPairs = getRecentPairs(table2Data, historyCheckDays);
  console.log(`Found ${recentPairs.size} recent pairs in last ${historyCheckDays} days`);

  // Create new pairs
  const pairs = createPairs(activeUsers, recentPairs);
  console.log(`Created ${pairs.length} new pairs`);

  return pairs;
}

module.exports = {
  generateNewPairs,
  excelDateToJSDate,
};
