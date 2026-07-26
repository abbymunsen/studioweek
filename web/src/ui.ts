/** Minimal DOM builder — the whole app re-renders from state on change. */

type Attrs = Record<string, string | boolean | number | null | undefined | EventListener>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2), v as EventListener);
    } else if (k === "style" && typeof v === "string") {
      node.setAttribute("style", v);
    } else if (v === true) {
      node.setAttribute(k, "");
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");
