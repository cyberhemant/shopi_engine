import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(toolDirectory, '../..');
const publicDirectory = path.join(toolDirectory, 'public');
const recipeDirectory = path.join(toolDirectory, 'recipes');
const builderPath = path.join(toolDirectory, 'build-recipes.mjs');
const schemaPath = path.join(projectDirectory, 'config/settings_schema.json');
const dataPath = path.join(projectDirectory, 'config/settings_data.json');
const port = Number(process.env.PORT || 4173);
const host = '127.0.0.1';
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const builds = new Map();

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readRecipes() {
  const files = (await readdir(recipeDirectory)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map(async (file) => readJson(path.join(recipeDirectory, file))));
}

function getSettings(schema) {
  return schema.flatMap((group) =>
    Array.isArray(group.settings)
      ? group.settings.map((setting) => ({ ...setting, group: group.name }))
      : [],
  );
}

function validateValue(setting, value) {
  if (setting.type === 'color') {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
      throw new Error(`${setting.label} must be a six-digit hex color.`);
    }
    return value.toUpperCase();
  }

  if (setting.type === 'range') {
    const number = Number(value);
    const stepCount = (number - setting.min) / setting.step;
    if (
      !Number.isFinite(number) ||
      number < setting.min ||
      number > setting.max ||
      Math.abs(stepCount - Math.round(stepCount)) > 1e-8
    ) {
      throw new Error(`${setting.label} must be between ${setting.min} and ${setting.max} in steps of ${setting.step}.`);
    }
    return number;
  }

  if (setting.type === 'font_picker') {
    if (typeof value !== 'string' || !/^[a-z0-9_]+$/i.test(value)) {
      throw new Error(`${setting.label} must be a Shopify font handle, such as assistant_n4.`);
    }
    return value;
  }

  if (setting.type === 'checkbox') {
    if (typeof value !== 'boolean') throw new Error(`${setting.label} must be on or off.`);
    return value;
  }

  if (setting.type === 'select') {
    const allowed = (setting.options || []).map((option) => option.value);
    if (!allowed.includes(value)) throw new Error(`${setting.label} has an unsupported option.`);
    return value;
  }

  if (typeof value !== 'string' || value.length > 1000) {
    throw new Error(`${setting.label} must be text under 1000 characters.`);
  }
  return value;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

async function handleSettings(request, response) {
  const [schema, data] = await Promise.all([readJson(schemaPath), readJson(dataPath)]);
  const settings = getSettings(schema);
  const defaults = Object.fromEntries(settings.map((setting) => [setting.id, setting.default]));
  const values = { ...defaults, ...(data.current || {}) };

  if (request.method === 'GET') {
    sendJson(response, 200, {
      groups: schema.filter((group) => Array.isArray(group.settings)),
      values,
      defaults,
    });
    return;
  }

  if (request.method !== 'PUT') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  const body = await readRequestBody(request);
  if (!body || typeof body.values !== 'object' || Array.isArray(body.values)) {
    sendJson(response, 400, { error: 'Expected a settings object.' });
    return;
  }

  const settingsById = new Map(settings.map((setting) => [setting.id, setting]));
  const updates = {};
  for (const [id, value] of Object.entries(body.values)) {
    const setting = settingsById.get(id);
    if (!setting) {
      sendJson(response, 400, { error: `Unknown setting: ${id}` });
      return;
    }
    updates[id] = validateValue(setting, value);
  }

  const nextData = {
    ...data,
    current: { ...(data.current || {}), ...updates },
  };
  await writeFile(dataPath, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
  sendJson(response, 200, { values: nextData.current });
}

function appendBuildOutput(build, chunk) {
  build.output = `${build.output}${chunk}`.slice(-60000);
}

async function startRecipeBuild(request, response) {
  const body = await readRequestBody(request);
  const recipes = await readRecipes();
  const recipe = recipes.find((item) => item.id === body?.recipeId);
  if (!recipe) {
    sendJson(response, 400, { error: 'Choose a valid theme recipe.' });
    return;
  }

  const buildId = randomUUID();
  const outputRelative = `dist/recipe-panel-${recipe.id}-${Date.now()}`;
  const build = {
    id: buildId,
    recipeId: recipe.id,
    recipeName: recipe.name,
    status: 'running',
    output: '',
    outputRelative,
    zipPath: null,
    error: null,
  };
  builds.set(buildId, build);

  const process = spawn(globalThis.process.execPath, [builderPath, outputRelative, recipe.id], {
    cwd: projectDirectory,
    env: globalThis.process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.on('data', (chunk) => appendBuildOutput(build, chunk.toString()));
  process.stderr.on('data', (chunk) => appendBuildOutput(build, chunk.toString()));
  process.on('error', (error) => {
    build.status = 'failed';
    build.error = error.message;
  });
  process.on('close', async (exitCode) => {
    if (build.status === 'failed') return;
    if (exitCode !== 0) {
      build.status = 'failed';
      build.error = `Build process exited with code ${exitCode}.`;
      return;
    }

    try {
      const schema = await readJson(schemaPath);
      const themeInfo = schema.find((group) => group.name === 'theme_info');
      const zipName = `${themeInfo.theme_name}-${themeInfo.theme_version}.zip`;
      const zipPath = path.join(projectDirectory, outputRelative, recipe.id, zipName);
      await access(zipPath);
      build.zipPath = zipPath;
      build.status = 'complete';
    } catch (error) {
      build.status = 'failed';
      build.error = `Build finished but its ZIP was not found: ${error.message}`;
    }
  });

  sendJson(response, 202, { buildId, status: build.status });
}

function getBuildResponse(build) {
  return {
    buildId: build.id,
    recipeId: build.recipeId,
    recipeName: build.recipeName,
    status: build.status,
    output: build.output,
    error: build.error,
    downloadUrl: build.status === 'complete' ? `/api/builds/${build.id}/download` : null,
  };
}

const server = createServer(async (request, response) => {
  const allowedHosts = new Set([`${host}:${port}`, `localhost:${port}`]);
  if (!allowedHosts.has(request.headers.host)) {
    sendJson(response, 403, { error: 'This settings panel is only available locally.' });
    return;
  }

  const url = new URL(request.url, `http://${host}:${port}`);
  try {
    if (url.pathname === '/api/recipes' && request.method === 'GET') {
      sendJson(response, 200, { recipes: await readRecipes() });
      return;
    }

    if (url.pathname === '/api/builds' && request.method === 'POST') {
      const origin = request.headers.origin;
      if (origin && origin !== `http://${host}:${port}` && origin !== `http://localhost:${port}`) {
        sendJson(response, 403, { error: 'Build requests must come from this local panel.' });
        return;
      }
      await startRecipeBuild(request, response);
      return;
    }

    const buildMatch = url.pathname.match(/^\/api\/builds\/([0-9a-f-]+)(?:\/(download))?$/i);
    if (buildMatch && request.method === 'GET') {
      const build = builds.get(buildMatch[1]);
      if (!build) {
        sendJson(response, 404, { error: 'Build not found.' });
        return;
      }
      if (buildMatch[2] === 'download') {
        if (build.status !== 'complete' || !build.zipPath) {
          sendJson(response, 409, { error: 'The theme ZIP is not ready yet.' });
          return;
        }
        response.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${path.basename(build.zipPath)}"`,
          'X-Content-Type-Options': 'nosniff',
        });
        createReadStream(build.zipPath).pipe(response);
        return;
      }
      sendJson(response, 200, getBuildResponse(build));
      return;
    }

    if (url.pathname === '/api/settings') {
      await handleSettings(request, response);
      return;
    }

    const staticFile = staticFiles.get(url.pathname);
    if (!staticFile || request.method !== 'GET') {
      response.writeHead(404, { 'Cache-Control': 'no-store' });
      response.end('Not found');
      return;
    }

    const [fileName, contentType] = staticFile;
    const content = await readFile(path.join(publicDirectory, fileName));
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:",
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(content);
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    sendJson(response, status, { error: error.message || 'Unable to process request.' });
  }
});

server.listen(port, host, () => {
  console.log(`Theme settings panel: http://${host}:${port}`);
  console.log('Settings are saved to config/settings_data.json.');
});