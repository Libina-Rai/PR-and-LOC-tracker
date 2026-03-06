// tracker.js

require('dotenv').config();
const { Octokit } = require("@octokit/rest");
const { google } = require('googleapis');
const cron = require('node-cron');

// --- GitHub Setup ---
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = process.env.GITHUB_REPO_OWNER;
const repoName = process.env.GITHUB_REPO_NAME;

// --- Team Members ---
const teamMembers = ["mushkan27", "Libina-rai", "Nepsoul"]; 

// --- Google Sheets Setup ---
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

// Function to write data to Google Sheet
async function writeToSheet(data) {
  // Get existing rows from the sheet
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Sheet1!A:F'
  });

  const existingRows = response.data.values || [];

  // Convert dates in existing rows to a Set of "date+user" keys
  const existingKeys = new Set(
    existingRows.map(row => `${row[0]}_${row[1]}`)
  );

  const today = new Date().toLocaleDateString();

  // Filter out entries already in the sheet
  const newValues = data
    .filter(d => !existingKeys.has(`${today}_${d.user}`))
    .map(d => [
      today,
      d.user,
      d.prs,
      d.added,
      d.deleted,
      d.net
    ]);

  if (newValues.length === 0) {
    console.log("No new data to write for today. Sheet already updated.");
    return;
  }

  // Append new rows
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Sheet1!A:F',
    valueInputOption: 'USER_ENTERED',
    resource: { values: newValues }
  });

  console.log("Data written to Google Sheet successfully.");
}

// --- Function to get PR count for a user today ---
async function getPRCount(user) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const until = new Date();
  until.setHours(23, 59, 59, 999);

  const prs = await octokit.rest.pulls.list({
    owner: repoOwner,
    repo: repoName,
    state: 'all',
    per_page: 100
  });

  const todayPRs = prs.data.filter(pr =>
    pr.user.login === user &&
    new Date(pr.created_at) >= since &&
    new Date(pr.created_at) <= until
  );

  return todayPRs.length;
}

// --- Function to get LOC for a user today ---
async function getLOC(user) {
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const until = new Date();
    until.setHours(23, 59, 59, 999);

    // Fetch commits from the active branch
    const commits = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: "Samay",  // <-- replace with your working branch
      since: since.toISOString(),
      until: until.toISOString(),
      per_page: 100
    });

    let added = 0;
    let deleted = 0;

    for (const commit of commits.data) {
      // Only count commits authored by the GitHub account
      if (commit.author && commit.author.login === user) {
        // Fetch stats for this commit
        const detail = await octokit.rest.repos.getCommit({
          owner,
          repo,
          ref: commit.sha
        });

        added += detail.data.stats.additions;
        deleted += detail.data.stats.deletions;
      }
    }

    const net = added - deleted;
    return { added, deleted, net };
  } catch (err) {
    console.error(`Error fetching LOC for ${user}:`, err.message);
    return { added: 0, deleted: 0, net: 0 };
  }
}
// --- Generate Report and Send to Google Sheet ---
async function generateReport() {
  console.log("Daily Team Report:");

  const reportData = [];

  for (const user of teamMembers) {
    const prCount = await getPRCount(user);
    const loc = await getLOC(user);

    console.log(`\n${user}:`);
    console.log(`PRs today: ${prCount}`);
    console.log(`Lines Added: ${loc.added}`);
    console.log(`Lines Deleted: ${loc.deleted}`);
    console.log(`Net Lines: ${loc.net}`);

    reportData.push({
      user,
      prs: prCount,
      added: loc.added,
      deleted: loc.deleted,
      net: loc.net
    });
  }

  await writeToSheet(reportData);
}

// --- Schedule Daily Cron Job ---
// Runs every day at 6 PM
cron.schedule('0 18 * * *', async () => {
  console.log('Running daily team report at 6 PM...');
  await generateReport();
});

// --- Optional: Run Immediately on Start ---
generateReport();