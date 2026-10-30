const THEME_STORAGE_KEY = "study-planner-theme";

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";

  const button = document.getElementById("themeToggle");
  if (button) {
    button.textContent = isDark ? "☀ ライトモード" : "🌙 ダークモード";
    button.setAttribute("aria-pressed", String(isDark));
  }
}

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "light");

document.addEventListener("DOMContentLoaded", () => {
  const button = document.createElement("button");
  button.id = "themeToggle";
  button.type = "button";
  button.className = "theme-toggle";
  button.addEventListener("click", () => {
    const nextTheme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  });

  document.body.appendChild(button);
  applyTheme(document.documentElement.dataset.theme);
});
