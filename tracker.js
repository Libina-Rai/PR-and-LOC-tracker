// tracker.js
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

// --- GitHub Setup ---
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = process.env.GITHUB_REPO_OWNER;
const repoName = process.env.GITHUB_REPO_NAME;

// --- Team Members ---
const teamMembers = ["Libina-Rai"]; // add more members if needed

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

// --- Function to get LOC from PRs created today ---
async function getLOC(user) {
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

  let added = 0;
  let deleted = 0;

  // Filter PRs created today by the user
  const todayPRs = prs.data.filter(
    (pr) =>
      pr.user.login === user &&
      new Date(pr.created_at) >= since &&
      new Date(pr.created_at) <= until
  );

  // Sum LOC from each PR
  for (const pr of todayPRs) {
    const detail = await octokit.rest.pulls.get({
      owner: repoOwner,
      repo: repoName,
      pull_number: pr.number,
    });

    added += detail.data.additions;
    deleted += detail.data.deletions;
  }

  return { added, deleted, net: added - deleted };
}

// --- Generate Daily Report ---
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

// --- Schedule Cron Job ---
// Runs every day at 6 PM
cron.schedule("0 18 * * *", async () => {
  console.log("\nRunning daily team report at 6 PM...");
  await generateReport();
});

// --- Optional: Run Immediately on Start ---
generateReport();