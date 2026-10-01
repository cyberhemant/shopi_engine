import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(toolDirectory, '../..');
const recipeDirectory = path.join(toolDirectory, 'recipes');
const buildStamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const requestedOutput = process.argv[2] || `dist/theme-recipes-${buildStamp}`;
const outputRoot = path.resolve(projectDirectory, requestedOutput);
const relativeOutput = path.relative(projectDirectory, outputRoot);
const sourceDirectories = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];

if (
  relativeOutput === '' ||
  relativeOutput.startsWith(`..${path.sep}`) ||
  path.isAbsolute(relativeOutput) ||
  relativeOutput.split(path.sep)[0] !== 'dist'
) {
  throw new Error('Build output must be inside the project dist/ directory.');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function sectionSchema(sectionType) {
  const filePath = path.join(projectDirectory, 'sections', `${sectionType}.liquid`);
  await access(filePath);
  const source = await readFile(filePath, 'utf8');
  const schemaMatch = source.match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/);
  if (!schemaMatch) throw new Error(`Section ${sectionType} has no schema block.`);
  return JSON.parse(schemaMatch[1]);
}

async function validateHeroCompatibility(sectionTypes) {
  const schemas = await Promise.all(sectionTypes.map(sectionSchema));
  const referenceSettings = JSON.stringify((schemas[0].settings || []).map(({ id, type }) => [id, type]));
  for (let index = 1; index < schemas.length; index += 1) {
    const settings = JSON.stringify((schemas[index].settings || []).map(({ id, type }) => [id, type]));
    if (settings !== referenceSettings) {
      throw new Error(`Section ${sectionTypes[index]} must use the same setting IDs and types as ${sectionTypes[0]}.`);
    }
  }
}

function runShopifyCommand(args, workingDirectory) {
  const result = spawnSync('shopify', args, {
    cwd: workingDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Shopify command failed (${result.status}): shopify ${args.join(' ')}`);
  }
}

async function loadRecipes() {
  const files = (await readdir(recipeDirectory)).filter((file) => file.endsWith('.json')).sort();
  if (files.length < 2) throw new Error('Add at least two recipe JSON files to compare variants.');
  return Promise.all(files.map(async (file) => readJson(path.join(recipeDirectory, file))));
}

const availableRecipes = await loadRecipes();
const requestedRecipeIds = process.argv.slice(3);
const unknownRecipes = requestedRecipeIds.filter((id) => !availableRecipes.some((recipe) => recipe.id === id));
if (unknownRecipes.length > 0) throw new Error(`Unknown recipe: ${unknownRecipes.join(', ')}`);
const recipes = requestedRecipeIds.length > 0
  ? availableRecipes.filter((recipe) => requestedRecipeIds.includes(recipe.id))
  : availableRecipes;
const recipeIds = new Set();
for (const recipe of recipes) {
  if (!/^[a-z0-9-]+$/.test(recipe.id || '')) throw new Error(`Invalid recipe id: ${recipe.id}`);
  if (recipeIds.has(recipe.id)) throw new Error(`Duplicate recipe id: ${recipe.id}`);
  recipeIds.add(recipe.id);
  if (!recipe.name || !recipe.homepageHeroSection) throw new Error(`Recipe ${recipe.id} is incomplete.`);
}

const sourceHeroType = 'hero';
const sectionTypes = [...new Set([sourceHeroType, ...recipes.map((recipe) => recipe.homepageHeroSection)])];
await validateHeroCompatibility(sectionTypes);

const indexPath = path.join(projectDirectory, 'templates', 'index.json');
const sourceIndex = await readJson(indexPath);
if (!sourceIndex.sections?.hero || !sourceIndex.order?.includes('hero')) {
  throw new Error('templates/index.json must contain the hero section instance.');
}

await mkdir(outputRoot, { recursive: true });
for (const recipe of recipes) {
  const outputDirectory = path.join(outputRoot, recipe.id);
  try {
    await access(outputDirectory);
    throw new Error(`Output already exists: ${path.relative(projectDirectory, outputDirectory)}. Choose another dist/ path.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await access(path.join(projectDirectory, 'sections', `${recipe.homepageHeroSection}.liquid`));
}

for (const recipe of recipes) {
  const outputDirectory = path.join(outputRoot, recipe.id);
  await mkdir(outputDirectory, { recursive: false });
  for (const directory of sourceDirectories) {
    await cp(path.join(projectDirectory, directory), path.join(outputDirectory, directory), { recursive: true, errorOnExist: true });
  }

  const generatedIndex = structuredClone(sourceIndex);
  generatedIndex.sections.hero.type = recipe.homepageHeroSection;
  await writeFile(
    path.join(outputDirectory, 'templates', 'index.json'),
    `${JSON.stringify(generatedIndex, null, 2)}\n`,
    'utf8',
  );
  console.log(`\n${recipe.name}: ${path.relative(projectDirectory, outputDirectory)} (hero: ${recipe.homepageHeroSection})`);
  runShopifyCommand(['theme', 'check'], outputDirectory);
  runShopifyCommand(['theme', 'package'], outputDirectory);
}

console.log(`Generated ${recipes.length} complete Shopify themes in ${path.relative(projectDirectory, outputRoot)}.`);