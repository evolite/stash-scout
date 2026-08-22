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
