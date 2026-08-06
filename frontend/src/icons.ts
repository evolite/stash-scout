const NS = "http://www.w3.org/2000/svg";

function svg(paths: string[], viewBox = "0 0 16 16"): SVGSVGElement {
  const el = document.createElementNS(NS, "svg");
  el.setAttribute("viewBox", viewBox);
  el.setAttribute("width", "12");
  el.setAttribute("height", "12");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", "2");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    el.appendChild(p);
  }
  return el;
}

export function iconClose(): SVGSVGElement {
  return svg(["M4 4l8 8", "M12 4l-8 8"]);
}

export function iconPlay(): SVGSVGElement {
  const el = document.createElementNS(NS, "svg");
  el.setAttribute("viewBox", "0 0 16 16");
  el.setAttribute("width", "12");
  el.setAttribute("height", "12");
  el.setAttribute("fill", "currentColor");
  el.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", "M4 3l9 5-9 5V3z");
  el.appendChild(p);
  return el;
}
