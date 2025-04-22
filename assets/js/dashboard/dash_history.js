document.addEventListener('DOMContentLoaded', function() {
    let currentTab = 'courses';
    let currentPage = 1;
    const perPage = 10;
    let filters = {};

    // Fonction pour charger les données
    function loadData() {
        const url = currentTab === 'courses' 
            ? '/api/dashboard/historique/courses' 
            : '/api/dashboard/historique/connexions';
        
        const params = new URLSearchParams({
            page: currentPage,
            per_page: perPage,
            ...filters
        });

        fetch(`${url}?${params}`)
            .then(response => response.json())
            .then(data => {
                updateTable(data);
                updatePagination(data);
            });
    }

    // Fonction pour mettre à jour le tableau
    function updateTable(data) {
        const tbody = document.getElementById(`${currentTab}TableBody`);
        tbody.innerHTML = '';

        const items = currentTab === 'courses' ? data.courses : data.connexions;
        
        items.forEach(item => {
            const row = document.createElement('tr');
            if (currentTab === 'courses') {
                row.innerHTML = `
                    <td><i class="bi bi-flag"></i> ${item.race_name}</td>
                    <td><i class="bi bi-calendar"></i> ${new Date(item.start_time).toLocaleString()}</td>
                    <td><i class="bi bi-person"></i> ${item.user_name}</td>
                    <td><i class="bi bi-clock"></i> ${item.duration || '-'}</td>
                    <td><i class="bi bi-signpost"></i> ${item.distance ? `${item.distance} km` : '-'}</td>
                    <td><i class="bi bi-speedometer2"></i> ${item.average_speed ? `${item.average_speed} km/h` : '-'}</td>
                    <td><i class="bi bi-lightning-charge"></i> ${item.max_speed ? `${item.max_speed} km/h` : '-'}</td>
                    <td><i class="bi bi-cloud-sun"></i> ${item.weather_conditions || '-'}</td>
                `;
            } else {
                row.innerHTML = `
                    <td><i class="bi bi-person"></i> ${item.user_name}</td>
                    <td><i class="bi bi-gear"></i> ${item.fonction}</td>
                    <td><i class="bi bi-${item.type === 'connexion' ? 'box-arrow-in-right' : 'box-arrow-right'}"></i> ${item.type}</td>
                    <td><i class="bi bi-calendar"></i> ${new Date(item.connection_date).toLocaleString()}</td>
                `;
            }
            tbody.appendChild(row);
        });
    }

    // Fonction pour mettre à jour la pagination
    function updatePagination(data) {
        const pagination = document.getElementById(`${currentTab}Pagination`);
        pagination.innerHTML = '';

        const totalPages = data.pages;
        const currentPage = data.current_page;

        // Bouton précédent
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `
            <a class="page-link" href="#" data-page="${currentPage - 1}">
                <i class="bi bi-chevron-left"></i> Précédent
            </a>
        `;
        pagination.appendChild(prevLi);

        // Pages
        for (let i = 1; i <= totalPages; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === currentPage ? 'active' : ''}`;
            li.innerHTML = `
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            `;
            pagination.appendChild(li);
        }

        // Bouton suivant
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `
            <a class="page-link" href="#" data-page="${currentPage + 1}">
                Suivant <i class="bi bi-chevron-right"></i>
            </a>
        `;
        pagination.appendChild(nextLi);

        // Gestionnaires d'événements pour la pagination
        pagination.querySelectorAll('.page-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = parseInt(e.target.dataset.page);
                if (page >= 1 && page <= totalPages) {
                    currentPage = page;
                    loadData();
                }
            });
        });
    }

    // Gestionnaire d'événements pour les onglets
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (e) => {
            currentTab = e.target.id.split('-')[0];
            currentPage = 1;
            loadData();
        });
    });

    // Gestionnaire d'événements pour les filtres
    document.getElementById('applyFilters').addEventListener('click', () => {
        const form = document.getElementById('filtersForm');
        filters = {};
        new FormData(form).forEach((value, key) => {
            if (value) filters[key] = value;
        });
        currentPage = 1;
        loadData();
        bootstrap.Modal.getInstance(document.getElementById('filtersModal')).hide();
    });

    // Chargement initial
    loadData();
}); 