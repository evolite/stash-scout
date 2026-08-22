const CHIP_BASE = "px-3 py-1.5 rounded border text-xs cursor-pointer transition-colors duration-150";
const CHIP_ACTIVE = CHIP_BASE + " border-accent bg-accent-dim text-text";
const CHIP_INACTIVE = CHIP_BASE + " border-line bg-surface text-muted hover:text-text";

export function renderChip(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = active ? CHIP_ACTIVE : CHIP_INACTIVE;
  chip.textContent = label;
  chip.addEventListener("click", onClick);
  return chip;
}
