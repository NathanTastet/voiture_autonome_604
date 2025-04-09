document.addEventListener("DOMContentLoaded", function () {
    const htmlEl = document.documentElement;
    const toggleBtn = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');
  
    function setTheme(theme) {
      htmlEl.setAttribute('data-bs-theme', theme);
      localStorage.setItem('theme', theme);
  
      if (icon) {
        icon.classList.remove('bi-sun-fill', 'bi-moon-fill');
        icon.classList.add(theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-fill');
      }
    }
  
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
  
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-bs-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
      });
    }
  });
  