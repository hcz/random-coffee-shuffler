require('dotenv').config();

module.exports = {
  yandexDisk: {
    oauthToken: process.env.YANDEX_OAUTH_TOKEN,
    filePath: process.env.YANDEX_FILE_PATH || '/RandomCoffee.xlsx',
  },
  spreadsheet: {
    sheet1Name: process.env.SHEET1_NAME || 'RandomCoffee',
    sheet2Name: process.env.SHEET2_NAME || 'History',
    pairingTextBase: process.env.PAIRING_TEXT || 'Random Coffee',
    historyCheckDays: parseInt(process.env.HISTORY_CHECK_DAYS || '30', 10),
  },
  localFile: {
    downloadPath: './temp_spreadsheet.xlsx',
  },
};
