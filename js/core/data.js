// Loading of the static JSON/SDF files in data/. Everything is cached for
// the lifetime of the page; nothing is sent anywhere.

const base = new URL('../../data/', import.meta.url);
const cache = new Map();

function getJSON(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(new URL(name, base)).then((r) => {
      if (!r.ok) throw new Error(`${name}: ${r.status}`);
      return r.json();
    }).catch((e) => { cache.delete(name); throw e; }));
  }
  return cache.get(name);
}

export async function compounds() {
  const doc = await getJSON('compounds.json');
  return doc.compounds;
}

let byId = null;
export async function compound(id) {
  if (!byId) byId = new Map((await compounds()).map((c) => [c.id, c]));
  return byId.get(id) || null;
}

export async function categories() {
  return (await getJSON('categories.json')).categories;
}

export async function comparisons() {
  return (await getJSON('comparisons.json')).presets;
}

export async function functionalGroups() {
  return (await getJSON('functional_groups.json')).groups;
}

// data/schedule.json: an array of lessons. An empty array (or a missing
// file) simply hides the lesson band on the home screen.
export async function schedule() {
  try {
    const s = await getJSON('schedule.json');
    return Array.isArray(s) ? s : (s.lessons || []);
  } catch (e) {
    return [];
  }
}

const sdfCache = new Map();
export function sdf(c) {
  if (!sdfCache.has(c.id)) {
    sdfCache.set(c.id, fetch(new URL(c.sdf, base)).then((r) => {
      if (!r.ok) throw new Error(`${c.sdf}: ${r.status}`);
      return r.text();
    }).catch((e) => { sdfCache.delete(c.id); throw e; }));
  }
  return sdfCache.get(c.id);
}

// data/elements.json (M4: periodic table, electron configuration)
export async function elements() {
  return getJSON('elements.json');
}
