// Which performer genders show up on scene cards. Purely a browsing
// preference (like SFW Mode / In Library in Navbar.ts) — localStorage-backed,
// not round-tripped through the server config, so it applies instantly with
// no Save step. StashDB's GenderEnum has exactly these six values (confirmed
// via introspection); a performer with no reported gender always shows,
// regardless of these toggles — there's nothing meaningful to filter it by.
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

export function getShownGenders(): Set<string> {
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
  localStorage.setItem(KEY, JSON.stringify([...current]));
}

export function isGenderShown(gender: string | null): boolean {
  if (gender === null) return true;
  return getShownGenders().has(gender);
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

// Whole-scene filter (distinct from isGenderShown, which only hides
// individual performer chips within a card). Applied server-side
// (server/statusFilter.ts) so pages come back full rather than being thinned
// out after pagination — this just builds the query param.
export function hideParam(): string {
  const hide = [
    getHideGayScenes() && "gay",
    getHideLesbianScenes() && "lesbian",
    getHideStraightScenes() && "straight",
  ].filter(Boolean);
  return hide.length ? `&hide=${hide.join(",")}` : "";
}
