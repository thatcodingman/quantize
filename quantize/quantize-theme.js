function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  function updateLabel() {
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark';
    btn.textContent = isDark ? 'Light' : 'Dark';
    btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  updateLabel();

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('quantize-theme', next);
    } catch (e) {
      // localStorage unavailable (e.g. private browsing) — theme just won't persist across visits
    }
    updateLabel();
  });
}

document.addEventListener('DOMContentLoaded', initThemeToggle);
