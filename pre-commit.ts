import { resolve } from "node:path";
import { createWriteStream, existsSync, rmSync } from "node:fs";
import { rm, readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { ReadableStream } from "node:stream/web";
import { exec } from "node:child_process";
import { promisify } from "node:util";

type MintlifyNav = { group: string; pages: Array<string | MintlifyNav> };

const tempFile = `${crypto.randomUUID()}.yml`; // This is 'global' so cleanup can non-awkwardly access it

const run = async (cmd: string) => {
  const result = await promisify(exec)(cmd);
  if (result.stderr) console.error(result.stderr);
  result.stdout = result.stdout.trim();
  return result;
};

const checkExecutingLocation = () => {
  if (!resolve(process.argv[1]).includes(".git/hooks")) {
    console.error(
      "Consider making this a proper pre-commit hook by 'cp'-ing it into .git/hooks/!",
    );
  }
};

const determineGitRepoPath = async () => run("git rev-parse --show-toplevel");

const isString = (obj: unknown): obj is string =>
  typeof obj === "string" || obj instanceof String;

const loadMintConfig = async (): Promise<{
  navigation: MintlifyNav[];
  openapi: string;
}> => {
  const gitRootLocation = await determineGitRepoPath();
  const currentMintConfig = await readFile(
    resolve(gitRootLocation.stdout, "mint.json"),
    { encoding: "utf8" },
  );
  const mintJson = JSON.parse(currentMintConfig);
  if (!isMintlifyNav(mintJson?.navigation)) {
    throw new Error(
      "The 'navigation' config in the mint.json appears to be malformed",
    );
  }
  if (!isString(mintJson?.openapi)) {
    throw new Error(
      "The 'openapi' config in the mint.json appears to be malformed",
    );
  }
  return mintJson;
};

const downloadOpenAPISchema = async () => {
  const mintConfig = await loadMintConfig();
  const schema = await fetch(mintConfig.openapi);
  if (!schema.body) {
    throw Error("Failed to fetch schema (received empty response body)");
  }
  const fileStream = createWriteStream(tempFile, { flags: "wx+" });
  await finished(
    Readable.fromWeb(schema.body as ReadableStream<any>).pipe(fileStream),
  );
  return tempFile;
};

const generateMintlifySchema = async () => {
  const gitRootLocation = await determineGitRepoPath();
  const schemaLocation = await downloadOpenAPISchema();
  const autogenFolder = "partner-solutions/api-reference/endpoints";
  await rm(resolve(gitRootLocation.stdout, autogenFolder), {
    recursive: true,
    force: true,
  });
  // This does a `cd` because Mintlify seems to take the full path when generating the suggested navigation, which is non-portable as it'll be machine-specific
  const schemaGeneration = await run(
    `cd ${gitRootLocation.stdout} && npx @mintlify/scraping openapi-file ${schemaLocation} -o ${autogenFolder}`,
  );
  return schemaGeneration;
};

const mintlifyNavigationToMap = (navigation: MintlifyNav[]) => {
  return new Map(navigation.map(({ group, pages }) => [group, pages]));
};

const isMintlifyNav = (obj: unknown): obj is MintlifyNav[] => {
  return (
    Array.isArray(obj) &&
    obj.every(
      (element) =>
        isString(element) ||
        (isString(element?.group) &&
          Array.isArray(element?.pages) &&
          element.pages.every(
            (page: any) => isString(page) || isMintlifyNav([page]),
          ) &&
          element.pages.length > 0),
    )
  );
};

const processNewNavigation = async () => {
  const output = await generateMintlifySchema();
  let newNavigation = "";
  let inJson = false;
  for (const line of output.stdout.split("\n")) {
    if (inJson) {
      newNavigation += line;
    }
    inJson = line == "navigation object suggestion:" || inJson;
  }
  const nav = JSON.parse(newNavigation);
  if (!isMintlifyNav(nav)) {
    throw new Error(
      `${JSON.stringify(
        nav,
      )} is invalid; check the Mintlify schema generation output: ${
        output.stdout
      }`,
    );
  }
  return mintlifyNavigationToMap(nav);
};

const extractRoutes = (nav: MintlifyNav[]): string[] =>
  nav
    .flatMap(({ pages }) =>
      pages.map((page) => (isString(page) ? page : extractRoutes([page]))),
    )
    .flat();

const isNavigationConfigValid = async (nav: MintlifyNav[]) => {
  const gitRootLocation = await determineGitRepoPath();
  const invalid = extractRoutes(nav).filter(
    (route) => !existsSync(resolve(gitRootLocation.stdout, `${route}.mdx`)),
  );
  if (invalid.length != 0) {
    throw new Error(
      `Invalid route configurations exist in the navigation: ${JSON.stringify(
        invalid,
      )}`,
    );
  }
};

const filterIgnoredRoutes = ({
  nav,
  routes,
}: {
  nav: MintlifyNav[];
  routes: string[];
}): MintlifyNav[] =>
  nav.map(({ group, pages }) => ({
    group,
    pages: pages
      .filter(
        (page) =>
          !isString(page) || !routes.some((route) => page.endsWith(route)),
      )
      .map((page) =>
        isString(page) ? page : filterIgnoredRoutes({ nav: [page], routes })[0],
      ),
  }));

const updateMintlifyConfig = async ({ ignore }: { ignore: string[] }) => {
  const gitRootLocation = await determineGitRepoPath();
  const mintConfig = await loadMintConfig();
  const generatedNav = await processNewNavigation();
  const newNav = new Map();
  for (const [group, pages] of mintlifyNavigationToMap(mintConfig.navigation)) {
    const routes = generatedNav.get(group);
    if (routes != null) {
      newNav.set(group, Array.from(new Set(pages.concat(routes))));
    } else {
      newNav.set(group, pages);
    }
  }
  const nav = [];
  for (const [group, pages] of newNav) {
    nav.push({ group, pages });
  }
  mintConfig.navigation = filterIgnoredRoutes({ nav, routes: ignore });
  await writeFile(
    resolve(gitRootLocation.stdout, "mint.json"),
    JSON.stringify(mintConfig, null, 4),
  );
  await isNavigationConfigValid(mintConfig.navigation);
};

const checkForBrokenLinks = async () => run("npx mintlify broken-links");

(async () => {
  checkExecutingLocation();
  const gitRootLocation = await determineGitRepoPath();
  const ignoredEndpoints = await readFile(
    resolve(gitRootLocation.stdout, "ignore-endpoints"),
    { encoding: "utf8" },
  );
  await updateMintlifyConfig({
    ignore: ignoredEndpoints.split("\n").filter(Boolean),
  });
  const brokenLinks = await checkForBrokenLinks();
  console.log(brokenLinks.stdout.trim());
  await rm(tempFile);
})().catch((e) => {
  if ("stderr" in e) {
    console.error(String(e.stderr).trim());
  }
  if ("stdout" in e) {
    console.error(String(e.stdout).trim());
  } else {
    console.error(e);
  }
  if (existsSync(tempFile)) rmSync(tempFile);
  process.exit(1);
});
