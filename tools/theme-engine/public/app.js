const groupNavigation = document.querySelector('#group-nav');
const groupsContainer = document.querySelector('#settings-groups');
const countLabel = document.querySelector('#setting-count');
const saveStatus = document.querySelector('#save-status');
const resetButton = document.querySelector('#reset-button');
const recipeList = document.querySelector('#recipe-list');
const recipeCount = document.querySelector('#recipe-count');
const recipeStatus = document.querySelector('#recipe-status');

let groups = [];
let values = {};
let defaults = {};
let saveTimer;
let saving = false;

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setStatus(message, state = '') {
  saveStatus.textContent = message;
  saveStatus.dataset.state = state;
}

function updateValue(id, value) {
  values[id] = value;
  setStatus('Unsaved changes', 'dirty');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveValues, 450);
}

function createColorControl(setting) {
  const controls = element('div', 'color-controls');
  const swatch = element('input', 'color-controls__swatch');
  swatch.type = 'color';
  swatch.id = setting.id;
  swatch.value = values[setting.id];
  swatch.setAttribute('aria-label', `${setting.label} color picker`);

  const hex = element('input', 'text-control color-controls__hex');
  hex.type = 'text';
  hex.value = values[setting.id].toUpperCase();
  hex.maxLength = 7;
  hex.autocomplete = 'off';
  hex.spellcheck = false;
  hex.setAttribute('aria-label', `${setting.label} hex value`);

  swatch.addEventListener('input', () => {
    hex.value = swatch.value.toUpperCase();
    updateValue(setting.id, hex.value);
  });
  hex.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(hex.value)) {
      swatch.value = hex.value;
      hex.removeAttribute('aria-invalid');
      updateValue(setting.id, hex.value.toUpperCase());
    } else {
      hex.setAttribute('aria-invalid', 'true');
    }
  });
  hex.addEventListener('change', () => {
    if (!/^#[0-9a-f]{6}$/i.test(hex.value)) {
      hex.value = values[setting.id].toUpperCase();
      hex.removeAttribute('aria-invalid');
    }
  });
  controls.append(swatch, hex);
  return controls;
}

function createRangeControl(setting) {
  const controls = element('div', 'range-controls');
  const input = element('input', 'range-controls__slider');
  input.type = 'range';
  input.id = setting.id;
  input.min = setting.min;
  input.max = setting.max;
  input.step = setting.step;
  input.value = values[setting.id];
  const output = element('output', 'range-controls__value', `${values[setting.id]}${setting.unit || ''}`);
  output.htmlFor = setting.id;
  input.addEventListener('input', () => {
    const value = Number(input.value);
    output.textContent = `${value}${setting.unit || ''}`;
    updateValue(setting.id, value);
  });
  controls.append(input, output);
  return controls;
}

function createTextControl(setting) {
  const input = element('input', 'text-control');
  input.id = setting.id;
  input.value = values[setting.id] ?? '';
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (setting.type === 'font_picker') {
    input.pattern = '[A-Za-z0-9_]+';
    input.maxLength = 64;
    input.placeholder = 'assistant_n4';
  } else if (setting.type === 'url') {
    input.type = 'url';
  } else {
    input.maxLength = 1000;
  }
  input.addEventListener('input', () => updateValue(setting.id, input.value));
  return input;
}

function createControl(setting) {
  if (setting.type === 'color') return createColorControl(setting);
  if (setting.type === 'range') return createRangeControl(setting);
  return createTextControl(setting);
}

function renderSettings() {
  const total = groups.reduce((sum, group) => sum + group.settings.length, 0);
  countLabel.textContent = `${total} global settings`;
  groupNavigation.replaceChildren();
  groupsContainer.replaceChildren();

  groups.forEach((group, index) => {
    const anchor = `group-${index}`;
    const link = element('a', 'group-link');
    link.href = `#${anchor}`;
    link.append(
      element('span', 'group-link__name', group.name),
      element('span', 'group-link__count', String(group.settings.length).padStart(2, '0')),
    );
    groupNavigation.append(link);

    const section = element('section', 'settings-group');
    section.id = anchor;
    const heading = element('div', 'settings-group__heading');
    heading.append(
      element('h2', '', group.name),
      element('span', 'settings-group__count', `${group.settings.length} SETTINGS`),
    );

    const rows = element('div', 'setting-rows');
    group.settings.forEach((setting) => {
      const row = element('div', 'setting-row');
      const information = element('div', 'setting-row__information');
      const label = element('label', 'setting-row__label', setting.label);
      label.htmlFor = setting.id;
      information.append(label, element('code', 'setting-row__key', setting.id));
      row.append(information, createControl(setting));
      rows.append(row);
    });

    section.append(heading, rows);
    groupsContainer.append(section);
  });
}

function setRecipeStatus(message, state = '') {
  recipeStatus.textContent = message;
  recipeStatus.dataset.state = state;
}

function renderRecipes(recipes) {
  recipeCount.textContent = `${recipes.length} RECIPES`;
  recipeList.replaceChildren();
  recipes.forEach((recipe) => {
    const card = element('article', 'recipe-card');
    const details = element('div', 'recipe-card__details');
    details.append(
      element('h3', 'recipe-card__name', recipe.name),
      element('code', 'recipe-card__key', `Homepage hero · ${recipe.homepageHeroSection}`),
    );
    const actions = element('div', 'recipe-card__actions');
    const button = element('button', 'recipe-build-button', 'Build ZIP');
    button.type = 'button';
    button.addEventListener('click', () => buildRecipe(recipe, button));
    actions.append(button);
    card.append(details, actions);
    recipeList.append(card);
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function buildRecipe(recipe, button) {
  button.disabled = true;
  button.textContent = 'Building…';
  setRecipeStatus(`${recipe.name}: generating, checking, and packaging.`, 'building');
  try {
    const startResponse = await fetch('/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: recipe.id }),
    });
    const started = await startResponse.json();
    if (!startResponse.ok) throw new Error(started.error || 'Could not start the build.');

    let result;
    do {
      await wait(900);
      const statusResponse = await fetch(`/api/builds/${started.buildId}`, { cache: 'no-store' });
      result = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(result.error || 'Could not read build status.');
    } while (result.status === 'running');

    if (result.status !== 'complete') throw new Error(result.error || 'The recipe build failed.');

    const download = element('a', 'recipe-download', 'Download ZIP');
    download.href = result.downloadUrl;
    download.setAttribute('download', '');
    const actions = button.parentElement;
    actions.append(download);
    button.textContent = 'Build again';
    setRecipeStatus(`${recipe.name}: ZIP ready.`, 'complete');
  } catch (error) {
    button.textContent = 'Retry build';
    setRecipeStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function saveValues() {
  if (saving) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveValues, 250);
    return;
  }
  saving = true;
  const snapshot = { ...values };
  setStatus('Saving…', 'saving');
  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: snapshot }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Settings could not be saved.');
    if (JSON.stringify(snapshot) === JSON.stringify(values)) {
      setStatus(`Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'saved');
    } else {
      setStatus('Unsaved changes', 'dirty');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveValues, 250);
    }
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    saving = false;
  }
}

resetButton.addEventListener('click', () => {
  if (!window.confirm('Reset all global settings to their schema defaults?')) return;
  values = { ...defaults };
  renderSettings();
  updateValue(Object.keys(values)[0], values[Object.keys(values)[0]]);
});

async function initialize() {
  try {
    const [settingsResponse, recipesResponse] = await Promise.all([
      fetch('/api/settings', { cache: 'no-store' }),
      fetch('/api/recipes', { cache: 'no-store' }),
    ]);
    const [settings, recipeResult] = await Promise.all([settingsResponse.json(), recipesResponse.json()]);
    if (!settingsResponse.ok) throw new Error(settings.error || 'Theme settings could not be loaded.');
    if (!recipesResponse.ok) throw new Error(recipeResult.error || 'Theme recipes could not be loaded.');
    groups = settings.groups;
    values = settings.values;
    defaults = settings.defaults;
    renderSettings();
    renderRecipes(recipeResult.recipes);
    resetButton.disabled = false;
    setStatus('Connected to workspace', 'saved');
  } catch (error) {
    groupsContainer.replaceChildren(element('p', 'error-state', error.message));
    setStatus('Connection failed', 'error');
  }
}

initialize();