# Random Coffee Pairing Application

A Node.js application that automatically creates user pairs for "random coffee" meetings by reading from a Yandex.Disk spreadsheet and intelligently avoiding recent pairings.

<p style="display: flex; align-items: center; gap:6px;">Built with <img alt="Claude" height="14px" src="http://upload.wikimedia.org/wikipedia/commons/8/8a/Claude_AI_logo.svg"/></p>

## Features

- Reads user data from Yandex.Disk spreadsheet (Excel format)
- Filters active users only
- Creates random pairs while avoiding recent pairings (configurable history check)
- Appends new pairs to the spreadsheet with current date
- Automatically uploads updated spreadsheet back to Yandex.Disk

## Spreadsheet Structure

### RandomCoffee Sheet (Users Table)
| Column | Description |
|--------|-------------|
| A | Email handle |
| B | Active (boolean) |
| C | Twice flag (optional) |

**Example:**
```
Email                  | Active | Twice
-----------------------|--------|-------
alice@company.com      | TRUE   | twice
bob@company.com        | TRUE   |
charlie@company.com    | FALSE  |
diana@company.com      | TRUE   | twice
```

**Twice Flag Explanation:**
- Leave empty for normal users
- Enter "twice" (case-insensitive) for users who can be paired twice
- When there's an odd number of active users, one random user marked "twice" will be selected to appear in two pairs
- This ensures everyone gets paired (no one left out)

### History Sheet (Pairings History)
| Column | Description |
|--------|-------------|
| A | Email handle 1 |
| B | Email handle 2 |
| C | Date (text format: dd/mm/yyyy) |
| D | Text field (round identifier) |

**Example:**
```
Email 1               | Email 2               | Date       | Round
----------------------|-----------------------|------------|------------------
alice@company.com     | bob@company.com       | 15/01/2024 | Random Coffee #1
carol@company.com     | dave@company.com      | 15/01/2024 | Random Coffee #1
```

## Setup

### 1. Get Yandex.Disk OAuth Token

You need to obtain an OAuth token to access your Yandex.Disk:

1. Go to the Yandex OAuth page: https://oauth.yandex.ru/
2. Register a new application or use an existing one
3. Get your OAuth token with the `cloud_api:disk.read` and `cloud_api:disk.write` permissions

For quick testing, you can use the Yandex.Disk API playground to generate a token:
- Visit: https://yandex.ru/dev/disk/poligon/
- Click "Get OAuth token"
- Copy the generated token

### 2. Configure Environment

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   YANDEX_OAUTH_TOKEN=your_actual_token_here
   YANDEX_FILE_PATH=/RandomCoffee.xlsx
   SHEET1_NAME=RandomCoffee
   SHEET2_NAME=History
   PAIRING_TEXT=Random Coffee
   HISTORY_CHECK_DAYS=30
   ```

### 3. Prepare Your Spreadsheet

1. Create an Excel spreadsheet (.xlsx) with two sheets named **RandomCoffee** and **History**
2. **RandomCoffee** sheet should contain:
   - Header row (optional)
   - Column A: Email addresses
   - Column B: Active status (TRUE/FALSE or 1/0)
   - Column C: Twice flag (optional - enter "twice" for users who can be paired twice)

3. **History** sheet should contain:
   - Header row (optional)
   - Columns: Email 1 | Email 2 | Date | Round
   - Can be empty initially (will be populated by the application)

4. Upload the spreadsheet to your Yandex.Disk

### 4. Install Dependencies

```bash
npm install
```

## Usage

Run the application:

```bash
npm start
```

The application will:
1. Download the spreadsheet from Yandex.Disk
2. Read users from RandomCoffee sheet (only active users)
3. Read pairing history from History sheet
4. Generate new pairs avoiding recent pairings
5. Append new pairs to History sheet with current date
6. Upload the updated spreadsheet back to Yandex.Disk

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `YANDEX_OAUTH_TOKEN` | Your Yandex.Disk OAuth token | Required |
| `YANDEX_FILE_PATH` | Path to spreadsheet on Yandex.Disk | `/RandomCoffee.xlsx` |
| `SHEET1_NAME` | Name of the users sheet | `RandomCoffee` |
| `SHEET2_NAME` | Name of the pairings sheet | `History` |
| `PAIRING_TEXT` | Base text for rounds (auto-increments: "Random Coffee #1", "#2", etc.) | `Random Coffee` |
| `HISTORY_CHECK_DAYS` | Days to check for recent pairings (legacy parameter) | `30` |

### Auto-Incrementing Round Numbers

The application automatically tracks and increments the pairing round number:

- **First run**: Creates pairs with text "Random Coffee #1"
- **Second run**: Creates pairs with text "Random Coffee #2"
- **Subsequent runs**: Automatically increments based on the highest round number found in your spreadsheet

The system intelligently detects the current round by:
1. Scanning all existing entries in History sheet
2. Finding the highest round number in entries matching the pattern `PAIRING_TEXT #N`
3. Incrementing that number for the new round

**Example:**
```
Existing entries: "Random Coffee #5", "Random Coffee #3", "Random Coffee #7"
Next round will be: "Random Coffee #8"
```

This feature helps you track which pairings belong to which round, making it easy to analyze pairing history and ensure proper rotation over time.

### Handling Odd Numbers with "Twice" Users

When you have an odd number of active users, normally one person would be left unpaired. The "twice" feature solves this:

**How it works:**
1. Mark one or more users in Column C of RandomCoffee sheet with "twice"
2. When there's an odd number of active users, the algorithm randomly selects one "twice" user
3. That user will appear in **two different pairs** in the same round
4. This ensures everyone gets paired - no one is left out

**Example Scenario:**
```
Active users: 5 (alice, bob, carol, dave, eve)
"Twice" users: alice, dave

Result:
- alice will be randomly selected (or dave - 50/50 chance)
- alice gets paired twice:
  Pair 1: alice - bob
  Pair 2: alice - carol
  Pair 3: dave - eve
```

**Benefits:**
- No one is excluded from coffee meetings
- Fair rotation: "twice" users share the load
- Flexible: mark multiple users as "twice" for random selection

**Note:** If there's an odd number and NO users are marked "twice", one person will remain unpaired (algorithm falls back to leaving the last person out).

## Algorithm Details

This application uses a **sophisticated matching algorithm** based on computer science research, combining graph theory, optimization algorithms, and social network analysis. Unlike competitors that use simple random pairing, this implementation delivers provably optimal matches.

### Core Algorithm: Hungarian Algorithm (Munkres)

The system uses the **Hungarian Algorithm** for optimal weighted bipartite matching (O(n³) complexity), finding the best possible pairing given multiple competing objectives.

### Multi-Objective Optimization

The algorithm optimizes four objectives simultaneously with configurable weights:

1. **Diversity Maximization (40% weight)**
   - Prioritizes employees with few common connections
   - Encourages cross-functional networking
   - Creates varied professional relationships

2. **History-Aware Matching (30% weight)**
   - Uses **exponential decay** for meeting history
   - Recent meetings incur heavy penalties
   - Distant past meetings have minimal penalty
   - Naturally prevents repetitive pairings

3. **Network Structure Optimization (20% weight)**
   - Detects organizational silos using community detection
   - Prioritizes **cross-community pairings** to break silos
   - Creates **bridge connections** between disconnected groups
   - Optimizes for "small world" network properties

4. **Preference Matching (10% weight)**
   - Reserved for future user preference features

### Key Features

- **Connection Graph Analysis**: Builds network graph of all historical meetings
- **Community Detection**: Identifies insular groups and systematically dissolves them
- **Exponential History Decay**: Recent meetings penalized exponentially more than old ones
- **Network Metrics**: Tracks average degree, cross-community connections, pairing quality
- **Guaranteed Optimization**: Finds mathematically optimal solution (not just "good enough")

### Algorithm Performance

The algorithm provides detailed metrics after each run:
- Cross-community pairing percentage
- Brand new vs. repeated pairings
- Network density and connectivity
- Average connections per employee

## GitLab CI/CD Integration

The project includes GitLab CI/CD configuration for automated pairing runs.

### Quick Setup

1. **Add CI/CD Variables** in your GitLab repository:
   - Go to **Settings** > **CI/CD** > **Variables**
   - Add `YANDEX_OAUTH_TOKEN` (mark as protected and masked)
   - Optionally add other configuration variables

2. **Push the `.gitlab-ci.yml`** file to your repository

3. **Run the pipeline**:
   - Go to **CI/CD** > **Pipelines**
   - Click **Run pipeline**
   - Manually trigger the `generate_pairings` job

### Scheduled Runs

To run pairings automatically on a schedule:

1. Go to **CI/CD** > **Schedules**
2. Create a new schedule (e.g., every Monday at 9:00 AM)
3. Uncomment the `scheduled_pairings` job in `.gitlab-ci.yml`

**For detailed setup instructions, see [GitLab CI/CD Setup Guide](docs/GITLAB_CI_SETUP.md)**

## Project Structure

```
random-coffee/
├── src/
│   ├── index.js                # Main application script
│   ├── config.js               # Configuration loader
│   ├── yandexDiskClient.js     # Yandex.Disk API client
│   └── pairingAlgorithm.js     # Advanced matching algorithm (Hungarian)
├── docs/
│   ├── GITLAB_CI_SETUP.md      # GitLab CI/CD setup guide
│   └── ...                     # Other documentation
├── .gitlab-ci.yml              # GitLab CI/CD configuration
├── package.json                # Project dependencies
├── .env                        # Environment variables (create from .env.example)
├── .env.example                # Example environment variables
└── .gitignore                  # Git ignore file
```

## Error Handling

The application includes error handling for:
- Missing OAuth token
- Invalid file paths
- Missing sheets in the workbook
- Network errors during upload/download
- Invalid date formats in history

## Dependencies

- `xlsx` - Reading and writing Excel files
- `axios` - HTTP client for Yandex.Disk API
- `dotenv` - Environment variable management
- `munkres-js` - Hungarian Algorithm implementation for optimal matching
- `graphology` - Graph data structure for connection network analysis
- `graphology-metrics` - Network metrics (centrality, clustering, etc.)

## License

ISC
