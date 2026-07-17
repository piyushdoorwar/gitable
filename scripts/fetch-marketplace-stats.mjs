import { readFile, writeFile } from "node:fs/promises";

const extensionId = "piyushdoorwar.gitable";
const sitePath = new URL("../site/index.html", import.meta.url);

const response = await fetch(
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
  {
    method: "POST",
    headers: {
      Accept: "application/json;api-version=7.2-preview.1",
      "Content-Type": "application/json",
      "User-Agent": "gitable-site-stats",
    },
    body: JSON.stringify({
      filters: [
        {
          criteria: [{ filterType: 7, value: extensionId }],
        },
      ],
      flags: 914,
    }),
  },
);

if (!response.ok) {
  throw new Error(`VS Marketplace request failed with HTTP ${response.status}`);
}

const data = await response.json();
const extension = data?.results?.[0]?.extensions?.[0];
const installs = extension?.statistics?.find(
  (statistic) => statistic.statisticName === "install",
)?.value;

if (extension?.extensionName !== "gitable" || !Number.isFinite(installs) || installs < 0) {
  throw new Error("VS Marketplace returned an invalid Gitable install count");
}

const roundedInstalls = Math.round(installs);
const html = await readFile(sitePath, "utf8");
const marker = /(<span id="marketplaceInstalls">)([^<]+)(<\/span>)/;
const match = html.match(marker);

if (!match) {
  throw new Error("Could not find the marketplaceInstalls marker in site/index.html");
}

if (match[2] === String(roundedInstalls)) {
  console.log(`VS Marketplace installs unchanged at ${roundedInstalls}`);
  process.exit(0);
}

const updatedHtml = html.replace(
  marker,
  (_match, openingTag, _oldValue, closingTag) =>
    `${openingTag}${roundedInstalls}${closingTag}`,
);

await writeFile(sitePath, updatedHtml);
console.log(`Updated VS Marketplace installs from ${match[2]} to ${roundedInstalls}`);
