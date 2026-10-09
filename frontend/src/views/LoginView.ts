import { api } from "../api.js";

const INPUT = "bg-surface-2 border border-line rounded px-3 py-2 text-sm";
const BTN = "bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:brightness-110 transition";

export function renderLoginView(mode: "off" | "local" | "oidc", onDone: () => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "min-h-screen flex items-center justify-center";
  const card = document.createElement("form");
  card.className = "bg-surface border border-line rounded-lg p-6 flex flex-col gap-3 w-80";
  const title = document.createElement("h1");
  title.className = "m-0 text-lg font-bold";
  title.textContent = "Stash Scout";
  const err = document.createElement("p");
  err.className = "m-0 text-xs text-amber";
  card.appendChild(title);

  if (mode === "oidc") {
    const sso = document.createElement("a");
    sso.href = "/api/auth/oidc/login";
    sso.className = BTN + " text-center";
    sso.textContent = "Sign in with SSO";
    card.appendChild(sso);
  } else {
    const user = document.createElement("input");
    user.className = INPUT;
    user.placeholder = "Username";
    user.autocomplete = "username";
    const pass = document.createElement("input");
    pass.className = INPUT;
    pass.type = "password";
    pass.placeholder = "Password";
    pass.autocomplete = "current-password";
    const btn = document.createElement("button");
    btn.className = BTN;
    btn.textContent = "Log in";
    card.append(user, pass, btn, err);
    card.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api.login(user.value, pass.value);
        onDone();
      } catch (ex) {
        err.textContent = (ex as Error).message === "invalid credentials" ? "Wrong username or password" : (ex as Error).message;
      }
    });
  }
  wrap.appendChild(card);
  return wrap;
}
