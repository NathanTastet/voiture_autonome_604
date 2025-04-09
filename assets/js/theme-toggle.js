function notifyIframeTheme(theme) {
    const iframe = document.getElementById("dashFrame");
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'theme', value: theme }, '*');
    }
}

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

        notifyIframeTheme(theme);
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

    const iframe = document.getElementById("dashFrame");
    if (iframe) {
        iframe.addEventListener("load", () => {
            const currentTheme = htmlEl.getAttribute("data-bs-theme");
            notifyIframeTheme(currentTheme);
        });
    }
});
