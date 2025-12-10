# GitLab CI/CD Setup Guide

This guide explains how to set up GitLab CI/CD for automated Random Coffee pairings.

## Prerequisites

- GitLab repository for this project
- Yandex.Disk OAuth token (see main README.md for how to obtain)
- Access to GitLab repository settings

## Setting Up CI/CD Variables

### 1. Navigate to CI/CD Settings

1. Go to your GitLab repository
2. Click **Settings** > **CI/CD**
3. Expand the **Variables** section
4. Click **Add variable** button

### 2. Add Required Variables

Add the following variables one by one:

#### YANDEX_OAUTH_TOKEN (Required)
- **Key**: `YANDEX_OAUTH_TOKEN`
- **Value**: Your Yandex.Disk OAuth token
- **Type**: Variable
- **Flags**:
  - ✅ **Protect variable** (recommended - only available in protected branches)
  - ✅ **Mask variable** (hides value in job logs)
  - ❌ Expand variable reference (leave unchecked)
- **Environments**: All (or select specific environments)

#### YANDEX_FILE_PATH (Optional)
- **Key**: `YANDEX_FILE_PATH`
- **Value**: `/shared/RandomCoffee.xlsx` (or your custom path)
- **Type**: Variable
- **Flags**: No special flags needed
- **Note**: If not set, defaults to `/shared/RandomCoffee.xlsx`

#### PAIRING_TEXT_BASE (Optional)
- **Key**: `PAIRING_TEXT_BASE`
- **Value**: `Random Coffee` (or your custom text)
- **Type**: Variable
- **Flags**: No special flags needed
- **Note**: If not set, defaults to `Random Coffee`

#### SHEET1_NAME (Optional)
- **Key**: `SHEET1_NAME`
- **Value**: `Table 1` (or your custom sheet name)
- **Type**: Variable
- **Flags**: No special flags needed
- **Note**: If not set, defaults to `Table 1`

#### SHEET2_NAME (Optional)
- **Key**: `SHEET2_NAME`
- **Value**: `Table 2` (or your custom sheet name)
- **Type**: Variable
- **Flags**: No special flags needed
- **Note**: If not set, defaults to `Table 2`

### 3. Variable Configuration Example

```
Variable Name          | Value                        | Protected | Masked
-----------------------|------------------------------|-----------|--------
YANDEX_OAUTH_TOKEN     | y0_AgA...your_token          | ✓         | ✓
YANDEX_FILE_PATH       | /shared/RandomCoffee.xlsx    |           |
PAIRING_TEXT_BASE      | Random Coffee                |           |
SHEET1_NAME            | Table 1                      |           |
SHEET2_NAME            | Table 2                      |           |
```

## Running the Pipeline

### Manual Execution

The pipeline is set to run manually by default for safety:

1. Go to **CI/CD** > **Pipelines**
2. Click **Run pipeline**
3. Select the **main** branch
4. Click **Run pipeline**
5. The pipeline will start and you'll see the `generate_pairings` job
6. Click the play button (▶) to manually trigger the job

### Scheduled Execution

To run pairings automatically on a schedule:

1. **Enable the scheduled job** in `.gitlab-ci.yml`:
   - Uncomment the `scheduled_pairings` job at the bottom of the file
   - Commit and push the changes

2. **Create a pipeline schedule**:
   - Go to **CI/CD** > **Schedules**
   - Click **New schedule**
   - Configure the schedule:
     - **Description**: e.g., "Weekly Random Coffee Pairing"
     - **Interval Pattern**:
       - Weekly: `0 9 * * 1` (Every Monday at 9:00 AM)
       - Monthly: `0 9 1 * *` (First day of month at 9:00 AM)
       - Custom: Use [cron syntax](https://crontab.guru/)
     - **Timezone**: Your timezone
     - **Target branch**: `main`
     - **Variables**: (optional) Can override variables for scheduled runs
   - Click **Save pipeline schedule**

### Scheduled Run Examples

**Every Monday at 9:00 AM**:
```
0 9 * * 1
```

**Every other Monday at 9:00 AM**:
```
0 9 * * 1/2
```

**First Monday of each month at 9:00 AM**:
```
0 9 1-7 * 1
```

**Every two weeks on Monday at 9:00 AM** (use pipeline schedule variables):
- Create two schedules alternating weeks

## Pipeline Stages

The CI/CD pipeline has two stages:

### 1. Test Stage
- Runs on merge requests and main branch
- Validates code (when tests are added)
- Fast feedback for contributors

### 2. Pair Stage
- Runs the pairing algorithm
- Uploads results to Yandex.Disk
- Configured as manual trigger for safety
- Can be automated via schedules

## Monitoring Pipeline Runs

### View Pipeline Results

1. Go to **CI/CD** > **Pipelines**
2. Click on a pipeline to see job details
3. Click on the `generate_pairings` job to see logs
4. Check for success message: `✓ Process completed successfully!`

### Common Pipeline Issues

**Issue**: Job fails with "YANDEX_OAUTH_TOKEN is not set"
- **Solution**: Add the `YANDEX_OAUTH_TOKEN` variable in CI/CD settings

**Issue**: Job fails with "Yandex.Disk API error: 401"
- **Solution**: OAuth token is invalid or expired - regenerate and update the variable

**Issue**: Job fails with "File not found"
- **Solution**: Check `YANDEX_FILE_PATH` variable and verify the file exists on Yandex.Disk

**Issue**: Job fails with "Sheet not found"
- **Solution**: Check `SHEET1_NAME` and `SHEET2_NAME` variables match your Excel file

## Security Best Practices

1. **Always protect and mask** the `YANDEX_OAUTH_TOKEN` variable
2. **Use protected branches** - only allow pipeline to run on `main` branch
3. **Review pipeline logs** - masked variables will show as `[masked]` in logs
4. **Rotate tokens regularly** - update OAuth token periodically
5. **Limit access** - only repository maintainers should access CI/CD variables

## Troubleshooting

### Check Variable Values in Pipeline

Add a debug step to your job (temporarily):

```yaml
script:
  - echo "File path is ${YANDEX_FILE_PATH}"
  - echo "Sheet 1 name is ${SHEET1_NAME}"
  # Never echo the OAuth token!
```

### Dry Run Mode

To test without uploading, modify the script temporarily:

```yaml
script:
  - echo "This is a dry run - not uploading"
  - npm start || true
```

## Next Steps

1. Set up all required CI/CD variables
2. Test the pipeline with a manual run
3. Verify results in Yandex.Disk
4. (Optional) Set up scheduled runs
5. Monitor pipeline execution and refine as needed

## Support

- For GitLab CI/CD documentation: https://docs.gitlab.com/ee/ci/
- For pipeline schedule syntax: https://crontab.guru/
- For project issues: Create an issue in the GitLab repository
