// "My molecules" (spec C-9): molecules made in the builder, kept only in
// this browser (localStorage). Nothing is sent anywhere.
//   { id, name, smiles, build?: {n, end, b, g} (assembly state), created, updated }
import { prefs } from '../core/dom.js';

const KEY = 'mymols';
const MAX = 100;

export function listMyMols() {
  try {
    const v = JSON.parse(prefs.get(KEY, '[]'));
    return Array.isArray(v) ? v.filter((m) => m && m.id && m.smiles) : [];
  } catch (e) {
    return [];
  }
}

function store(list) {
  prefs.set(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function getMyMol(id) {
  return listMyMols().find((m) => m.id === id) || null;
}

// Saving the same SMILES again updates the name instead of adding a copy.
export function saveMyMol({ name, smiles, build = null }) {
  const list = listMyMols();
  const now = Date.now();
  let m = list.find((x) => x.smiles === smiles);
  if (m) {
    Object.assign(m, { name, build: build || m.build || null, updated: now });
    list.splice(list.indexOf(m), 1);
  } else {
    m = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), name, smiles, build, created: now, updated: now };
  }
  list.unshift(m);
  store(list);
  return m;
}

export function renameMyMol(id, name) {
  const list = listMyMols();
  const m = list.find((x) => x.id === id);
  if (m) {
    m.name = name;
    m.updated = Date.now();
    store(list);
  }
  return m || null;
}

export function deleteMyMol(id) {
  store(listMyMols().filter((m) => m.id !== id));
}
