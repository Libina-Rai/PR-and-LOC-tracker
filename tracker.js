// tracker.js

require("dotenv").config();
const { Octokit } = require("@octokit/rest");
const cron = require("node-cron");

// --- GitHub Setup ---
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = process.env.GITHUB_REPO_OWNER;
const repoName = process.env.GITHUB_REPO_NAME;

// --- Team Members ---
const teamMembers = ["mushkan27", "Nepsoul"];

// --- Function to get PR count for a user today ---
async function getPRCount(user) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const until = new Date();
  until.setHours(23, 59, 59, 999);

  const prs = await octokit.rest.pulls.list({
    owner: repoOwner,
    repo: repoName,
    state: "all",
    per_page: 100,
  });

  const todayPRs = prs.data.filter(
    (pr) =>
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

    const commits = await octokit.rest.repos.listCommits({
      owner: repoOwner,
      repo: repoName,
      sha: "samay", // branch name
      since: since.toISOString(),
      until: until.toISOString(),
      per_page: 100,
    });

    let added = 0;
    let deleted = 0;

    for (const commit of commits.data) {
      if (commit.author && commit.author.login === user) {
        const detail = await octokit.rest.repos.getCommit({
          owner: repoOwner,
          repo: repoName,
          ref: commit.sha,
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

// --- Generate Report ---
async function generateReport() {
  console.log("Daily Team Report:");

  for (const user of teamMembers) {
    const prCount = await getPRCount(user);
    const loc = await getLOC(user);

    console.log(`\n${user}:`);
    console.log(`PRs today: ${prCount}`);
    console.log(`Lines Added: ${loc.added}`);
    console.log(`Lines Deleted: ${loc.deleted}`);
    console.log(`Net Lines: ${loc.net}`);
  }
}

// --- Schedule Daily Cron Job ---
// Runs every day at 6 PM
cron.schedule("0 18 * * *", async () => {
  console.log("Running daily team report at 6 PM...");
  await generateReport();
});

// --- Optional: Run Immediately on Start ---
generateReport();