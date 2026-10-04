require('dotenv').config();

module.exports = {
  yandexDisk: {
    oauthToken: process.env.YANDEX_OAUTH_TOKEN,
    filePath: process.env.YANDEX_FILE_PATH || '/RandomCoffee.xlsx',
  },
  spreadsheet: {
    employeesSheetName: process.env.SHEET1_NAME || 'RandomCoffee',
    historySheetName: process.env.SHEET2_NAME || 'History',
    roundLabelPrefix: process.env.PAIRING_TEXT || 'Random Coffee',
  },
  localFile: {
    downloadPath: './temp_spreadsheet.xlsx',
  },
};
