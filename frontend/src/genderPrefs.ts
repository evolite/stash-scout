export const GENDERS = [
  { id: "FEMALE", label: "Female" },
  { id: "MALE", label: "Male" },
  { id: "TRANSGENDER_FEMALE", label: "Transgender Female" },
  { id: "TRANSGENDER_MALE", label: "Transgender Male" },
  { id: "NON_BINARY", label: "Non-binary" },
  { id: "INTERSEX", label: "Intersex" },
] as const;

const KEY = "shownGenders";
const DEFAULT_SHOWN = ["FEMALE"];

let shownCache: Set<string> | undefined;

export function getShownGenders(): Set<string> {
  shownCache ??= readShownGenders();
  return new Set(shownCache);
}

function readShownGenders(): Set<string> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return new Set(DEFAULT_SHOWN);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set(DEFAULT_SHOWN);
  } catch {
    return new Set(DEFAULT_SHOWN);
  }
}

export function setGenderShown(gender: string, shown: boolean): void {
  const current = getShownGenders();
  if (shown) current.add(gender);
  else current.delete(gender);
  shownCache = current;
  localStorage.setItem(KEY, JSON.stringify([...current]));
}

export function isGenderShown(gender: string | null): boolean {
  if (gender === null) return true;
  shownCache ??= readShownGenders();
  return shownCache.has(gender);
}

const HIDE_GAY_KEY = "hideGayScenes";
const HIDE_LESBIAN_KEY = "hideLesbianScenes";
const HIDE_STRAIGHT_KEY = "hideStraightScenes";

export function getHideGayScenes(): boolean {
  return localStorage.getItem(HIDE_GAY_KEY) === "true";
}
export function setHideGayScenes(v: boolean): void {
  localStorage.setItem(HIDE_GAY_KEY, String(v));
}
export function getHideLesbianScenes(): boolean {
  return localStorage.getItem(HIDE_LESBIAN_KEY) === "true";
}
export function setHideLesbianScenes(v: boolean): void {
  localStorage.setItem(HIDE_LESBIAN_KEY, String(v));
}
export function getHideStraightScenes(): boolean {
  return localStorage.getItem(HIDE_STRAIGHT_KEY) === "true";
}
export function setHideStraightScenes(v: boolean): void {
  localStorage.setItem(HIDE_STRAIGHT_KEY, String(v));
}

export function hideParam(): string {
  const hide = [
    getHideGayScenes() && "gay",
    getHideLesbianScenes() && "lesbian",
    getHideStraightScenes() && "straight",
  ].filter(Boolean);
  return hide.length ? `&hide=${hide.join(",")}` : "";
}
