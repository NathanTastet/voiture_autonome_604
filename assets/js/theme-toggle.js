function notifyIframeTheme(theme) {
    const iframe = document.getElementById("dashFrame");
    if (iframe) {
        const currentUrl = new URL(iframe.src, window.location.origin);
        if (currentUrl.searchParams.get("theme") !== theme) {
            currentUrl.searchParams.set("theme", theme);
            currentUrl.searchParams.set("_ts", Date.now()); // Param pour casser le cache
            iframe.src = currentUrl.toString();  // 🔁 recharge avec le bon thème
        }
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const htmlEl = document.documentElement;
    const toggleBtn = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');

    function setTheme(theme) {
        htmlEl.setAttribute('data-bs-theme', theme);
        localStorage.setItem('theme', theme);
        document.cookie = "theme=" + theme + "; path=/"; 

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
});
