import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const explicitlySafeFiles = new Set([".env.example", "scripts/check-secrets.mjs"]);
const patterns = [
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { name: "Google private key", regex: /"private_key"\s*:\s*"-----BEGIN/u },
  { name: "Google service-account key", regex: /"type"\s*:\s*"service_account"/u },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/u },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u },
  { name: "AWS access key", regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u },
];

function listCandidateFiles() {
  try {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      encoding: "utf8",
    })
      .split(/\r?\n/u)
      .filter(Boolean);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown git error";
    throw new Error(`Secret scan could not enumerate repository files: ${reason}`);
  }
}

const findings = [];

for (const file of listCandidateFiles()) {
  if (explicitlySafeFiles.has(file)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of patterns) {
    if (pattern.regex.test(content)) findings.push(`${file}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected:\n" + findings.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Secret-pattern scan passed.");
}
