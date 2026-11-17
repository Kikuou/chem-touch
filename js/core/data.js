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

// 身近なもの: groups of library categories (data/categories.json "life")
export async function lifeGroups() {
  return (await getJSON('categories.json')).life || [];
}

// The lesson plan in use (data/plans/index.json -> data/plans/<id>.json).
// A teacher trying a draft from 授業をつくる (views/teach.js) sees the draft
// instead, on that device only.
export async function lessonPlan({ file = false } = {}) {
  if (!file) {
    try {
      if (localStorage.getItem('chemtouch:teach:use') === '1') {
        const d = JSON.parse(localStorage.getItem('chemtouch:teach:draft') || 'null');
        if (d && Array.isArray(d.lessons)) return d;
      }
    } catch (e) { /* no storage: the file */ }
  }
  const index = await getJSON('plans/index.json');
  return getJSON(`plans/${index.current}.json`);
}

// Hands-on materials (data/labs.json) and the three-state temperatures
// from PubChem (data/states.json)
export async function labs() {
  return getJSON('labs.json');
}
// homologous series with boiling / melting points from PubChem
export async function seriesData() {
  return getJSON('series.json');
}
export async function states() {
  return (await getJSON('states.json')).substances;
}

// Question bank of the colour cards and おわりの3問, by id
let qById = null;
export async function questions() {
  if (!qById) qById = new Map((await getJSON('questions.json')).questions.map((q) => [q.id, q]));
  return qById;
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

// data/practice.json (つくる: molecules of the notation practice)
export async function practiceSet() {
  return getJSON('practice.json');
}
