// tracker.js
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

// --- GitHub Setup ---
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// --- Team Members ---
const teamMembers = ["Libina-Rai"];

// --- Helper: Date range for today ---
function getTodayRange() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const until = new Date();
  until.setHours(23, 59, 59, 999);

  return { since, until };
}

// --- Function to get PR count for exercises repo ---
async function getPRCount(user) {
  const { since, until } = getTodayRange();

  const prs = await octokit.rest.pulls.list({
    owner: process.env.EXERCISES_REPO_OWNER,
    repo: process.env.EXERCISES_REPO_NAME,
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

// --- Function to get LOC for exercises repo (PR-based) ---
async function getExercisesLOC(user) {
  const { since, until } = getTodayRange();

  const prs = await octokit.rest.pulls.list({
    owner: process.env.EXERCISES_REPO_OWNER,
    repo: process.env.EXERCISES_REPO_NAME,
    state: "all",
    per_page: 100,
  });

  let added = 0;
  let deleted = 0;

  const todayPRs = prs.data.filter(
    (pr) =>
      pr.user.login === user &&
      new Date(pr.created_at) >= since &&
      new Date(pr.created_at) <= until
  );

  for (const pr of todayPRs) {
    const detail = await octokit.rest.pulls.get({
      owner: process.env.EXERCISES_REPO_OWNER,
      repo: process.env.EXERCISES_REPO_NAME,
      pull_number: pr.number,
    });

    added += detail.data.additions;
    deleted += detail.data.deletions;
  }

  return { added, deleted, net: added - deleted };
}

// --- Function to get LOC for workshop repo (commit-based) ---
async function getWorkshopLOC(user) {
  const { since, until } = getTodayRange();

  const commits = await octokit.rest.repos.listCommits({
    owner: process.env.WORKSHOP_REPO_OWNER,
    repo: process.env.WORKSHOP_REPO_NAME,
    author: user,
    sha: "main", // track only main branch
    since: since.toISOString(),
    until: until.toISOString(),
    per_page: 100,
  });

  let added = 0;
  let deleted = 0;

  for (const commit of commits.data) {
    const detail = await octokit.rest.repos.getCommit({
      owner: process.env.WORKSHOP_REPO_OWNER,
      repo: process.env.WORKSHOP_REPO_NAME,
      ref: commit.sha,
    });

    added += detail.data.stats.additions;
    deleted += detail.data.stats.deletions;
  }

  return { added, deleted, net: added - deleted };
}

// --- Generate Daily Report ---
async function generateReport() {
  console.log("Daily Team Report:");

  for (const user of teamMembers) {
    // Exercises PR-based
    const prCount = await getPRCount(user);
    const exercisesLOC = await getExercisesLOC(user);

    // Workshop commit-based
    const workshopLOC = await getWorkshopLOC(user);

    // Combine totals
    const totalAdded = exercisesLOC.added + workshopLOC.added;
    const totalDeleted = exercisesLOC.deleted + workshopLOC.deleted;

    console.log(`\n${user}:`);
    console.log(`PRs today (Exercises): ${prCount}`);
    console.log(`Exercises LOC: +${exercisesLOC.added} / -${exercisesLOC.deleted}`);
    console.log(`Workshop LOC: +${workshopLOC.added} / -${workshopLOC.deleted}`);
    console.log(`Total Net Lines Today: ${totalAdded - totalDeleted}`);
  }
}

// --- Schedule Daily Cron Job (6 PM) ---
cron.schedule("0 18 * * *", async () => {
  console.log("\nRunning daily team report at 6 PM...");
  await generateReport();
});

// --- Optional: Run Immediately on Start ---
generateReport();