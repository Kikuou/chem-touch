// What this device remembers about the lessons (nothing is sent anywhere):
//   today's lesson  chosen on the home screen, or set by a lesson link with
//                   ?today=1 (the teacher's QR code)
//   できた印        the result of おわりの3問 for each lesson
import { prefs } from '../core/dom.js';

export function todayNo() {
  const n = parseInt(prefs.get('lesson:today', ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function setToday(no) {
  prefs.set('lesson:today', no ? String(no) : null);
}

export function doneMap() {
  try {
    const d = JSON.parse(prefs.get('lesson:done', '{}'));
    return d && typeof d === 'object' ? d : {};
  } catch (e) {
    return {};
  }
}

export function setDone(no, score, total) {
  const d = doneMap();
  d[no] = { score, total };
  prefs.set('lesson:done', JSON.stringify(d));
}

// the hash students open from the teacher's QR code: it also makes the
// lesson today's lesson on their phone
export function lessonShareHash(no) {
  return `#/lesson/${no}?today=1`;
}
