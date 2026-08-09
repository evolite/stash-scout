const NS = "http://www.w3.org/2000/svg";

function svg(paths: string[], viewBox = "0 0 16 16", size = 12): SVGSVGElement {
  const el = document.createElementNS(NS, "svg");
  el.setAttribute("viewBox", viewBox);
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
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

export function iconPlus(): SVGSVGElement {
  return svg(["M8 3v10", "M3 8h10"]);
}

export function iconMinus(): SVGSVGElement {
  return svg(["M3 8h10"]);
}

export function iconCheckCircle(): SVGSVGElement {
  return svg(["M6 10l2.5 2.5L14 7", "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"], "0 0 20 20", 32);
}

export function iconRefresh(): SVGSVGElement {
  return svg(["M23 4v6h-6", "M20.49 15a9 9 0 1 1-2.12-9.36L23 10"], "0 0 24 24", 12);
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
