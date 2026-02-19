// Dashboard JavaScript

let allSettings = {};
let allHistory = [];

// Check authentication before loading dashboard
function checkAuth() {
    const auth = localStorage.getItem('gitguard_auth');
    if (!auth) {
        // Not authenticated, redirect to landing page
        window.location.href = '/';
        return false;
    }

    try {
        const authData = JSON.parse(auth);
        // Check if session is still valid (24 hours)
        const sessionDuration = 24 * 60 * 60 * 1000;
        if (Date.now() - authData.timestamp > sessionDuration) {
            // Session expired
            localStorage.removeItem('gitguard_auth');
            window.location.href = '/';
            return false;
        }
        return true;
    } catch (e) {
        localStorage.removeItem('gitguard_auth');
        window.location.href = '/';
        return false;
    }
}

// Logout function
function logout() {
    localStorage.removeItem('gitguard_auth');
    window.location.href = '/';
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication first
    if (!checkAuth()) {
        return;
    }

    // Add logout button to header
    addLogoutButton();

    setupTabs();
    loadSettings();
    loadHistory();
    loadStatistics();
    setupEventListeners();
});

// Add logout button to header
function addLogoutButton() {
    const header = document.querySelector('header');
    if (header) {
        const logoutBtn = document.createElement('button');
        logoutBtn.textContent = 'Sign Out';
        logoutBtn.className = 'btn-secondary';
        logoutBtn.style.cssText = 'position: absolute; top: 24px; right: 32px; font-size: 0.875rem;';
        logoutBtn.onclick = logout;
        header.style.position = 'relative';
        header.appendChild(logoutBtn);
    }
}

// Tab switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabsContainer = document.querySelector('.tabs');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update tabs container data attribute for CSS animation
            if (tabsContainer) {
                tabsContainer.setAttribute('data-active', targetTab);
            }

            // Update content
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(`${targetTab}-tab`).classList.add('active');

            // Refresh data when switching tabs
            if (targetTab === 'settings') loadSettings();
            if (targetTab === 'history') loadHistory();
            if (targetTab === 'statistics') loadStatistics();
        });
    });

    // Set initial active tab
    if (tabsContainer) {
        tabsContainer.setAttribute('data-active', 'settings');
    }
}

// Event listeners
function setupEventListeners() {
    const refreshSettings = document.getElementById('refresh-settings');
    const refreshHistory = document.getElementById('refresh-history');
    const historyFilter = document.getElementById('history-repo-filter');
    const statsFilter = document.getElementById('stats-repo-filter');

    if (refreshSettings) refreshSettings.addEventListener('click', loadSettings);
    if (refreshHistory) refreshHistory.addEventListener('click', loadHistory);
    if (historyFilter) historyFilter.addEventListener('change', loadHistory);
    if (statsFilter) statsFilter.addEventListener('change', loadStatistics);
}

// Load repository settings
async function loadSettings() {
    const container = document.getElementById('settings-list');
    container.innerHTML = '<div class="loading">Loading settings...</div>';

    try {
        const response = await fetch('/api/dashboard/settings');
        const data = await response.json();

        if (data.success) {
            allSettings = data.settings;
            renderSettings(data.settings);
            updateRepoFilters();
        } else {
            container.innerHTML = '<div class="empty-state">Failed to load settings</div>';
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        container.innerHTML = '<div class="empty-state">Error loading settings</div>';
    }
}

// Render settings
function renderSettings(settings) {
    const container = document.getElementById('settings-list');

    if (Object.keys(settings).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-text">No repositories configured yet</div>
            </div>
        `;
        return;
    }

    container.innerHTML = Object.entries(settings).map(([repo, config]) => `
        <div class="repo-card" data-repo="${repo}">
            <div class="repo-header">
                <div>
                    <div class="repo-name">${repo}</div>
                    <div class="repo-status ${config.enabled ? 'enabled' : 'disabled'}">
                        ${config.enabled ? '✓ Enabled' : '✗ Disabled'}
                    </div>
                </div>
            </div>
            <div class="settings-grid">
                <div class="setting-item">
                    <div class="setting-label">
                        <strong>Strict Mode</strong>
                        <small>More aggressive code review</small>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" data-setting="strictMode" ${config.strictMode ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-item">
                    <div class="setting-label">
                        <strong>Ignore Styling Issues</strong>
                        <small>Skip formatting/style checks</small>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" data-setting="ignoreStyling" ${config.ignoreStyling ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-item">
                    <div class="setting-label">
                        <strong>Ignore Linter Issues</strong>
                        <small>Skip linter warnings</small>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" data-setting="ignoreLinter" ${config.ignoreLinter ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-item">
                    <div class="setting-label">
                        <strong>Enable Reviews</strong>
                        <small>Enable/disable reviews for this repo</small>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" data-setting="enabled" ${config.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        </div>
    `).join('');

    // Attach event listeners to toggles
    container.querySelectorAll('.toggle-switch input').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const repo = e.target.closest('.repo-card').dataset.repo;
            const setting = e.target.dataset.setting;
            updateSetting(repo, setting, e.target.checked);
        });
    });
}

// Update setting
async function updateSetting(repository, setting, value) {
    try {
        const response = await fetch(`/api/dashboard/settings/${encodeURIComponent(repository)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [setting]: value })
        });

        const data = await response.json();

        if (data.success) {
            // Update local state
            if (!allSettings[repository]) {
                allSettings[repository] = {};
            }
            allSettings[repository][setting] = value;

            // Show success feedback
            showNotification(`Setting updated: ${setting} = ${value}`, 'success');
        } else {
            showNotification('Failed to update setting', 'error');
            // Reload to reset UI
            loadSettings();
        }
    } catch (error) {
        console.error('Error updating setting:', error);
        showNotification('Error updating setting', 'error');
        loadSettings();
    }
}



// Load review history
async function loadHistory() {
    const container = document.getElementById('history-list');
    const repoFilter = document.getElementById('history-repo-filter').value;

    container.innerHTML = '<div class="loading">Loading history...</div>';

    try {
        const url = `/api/dashboard/history${repoFilter ? `?repository=${encodeURIComponent(repoFilter)}` : ''}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            allHistory = data.history;
            renderHistory(data.history);
        } else {
            container.innerHTML = '<div class="empty-state">Failed to load history</div>';
        }
    } catch (error) {
        console.error('Error loading history:', error);
        container.innerHTML = '<div class="empty-state">Error loading history</div>';
    }
}

// Render history
function renderHistory(history) {
    const container = document.getElementById('history-list');

    if (!history || history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📜</div>
                <div class="empty-state-text">No review history yet</div>
            </div>
        `;
        return;
    }

    container.innerHTML = history.map(entry => {
        const reviewContent = entry.reviewBody || entry.llmResponse?.response || entry.response || 'No review content';
        const createdAt = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Unknown date';

        return `
        <div class="history-item">
            <div class="history-header">
                <div>
                    <div class="history-repo">${escapeHtml(entry.repository || 'Unknown')}</div>
                    <div style="margin-top: 5px; color: #666;">PR #${entry.pullRequestNumber || 'N/A'}: ${escapeHtml(entry.title || 'N/A')}</div>
                </div>
                <div class="history-meta">
                    <div>${createdAt}</div>
                    ${entry.author ? `<div style="margin-top: 5px;">by ${escapeHtml(entry.author)}</div>` : ''}
                </div>
            </div>
            <div class="history-body">${escapeHtml(reviewContent)}</div>
        </div>
    `;
    }).join('');
}

// Load statistics
async function loadStatistics() {
    const container = document.getElementById('statistics-content');
    const repoFilter = document.getElementById('stats-repo-filter').value;

    container.innerHTML = '<div class="loading">Loading statistics...</div>';

    try {
        const url = `/api/dashboard/statistics${repoFilter ? `?repository=${encodeURIComponent(repoFilter)}` : ''}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            renderStatistics(data.statistics);
        } else {
            container.innerHTML = '<div class="empty-state">Failed to load statistics</div>';
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
        container.innerHTML = '<div class="empty-state">Error loading statistics</div>';
    }
}

// Render statistics
function renderStatistics(stats) {
    const container = document.getElementById('statistics-content');

    // Handle missing or undefined stats
    if (!stats) {
        container.innerHTML = '<div class="empty-state">No statistics available</div>';
        return;
    }

    const issuesByType = stats.issuesByType || { Bug: 0, Security: 0, Performance: 0, Quality: 0 };

    container.innerHTML = `
        <div class="stat-card">
            <h3>${stats.totalReviews || 0}</h3>
            <p>Total Reviews</p>
        </div>
        <div class="stat-card">
            <h3>${stats.repositories || 0}</h3>
            <p>Repositories</p>
        </div>
        <div class="stat-breakdown">
            <div class="stat-item">
                <div class="stat-item-value" style="color: #dc3545;">${issuesByType.Bug || 0}</div>
                <div class="stat-item-label">🐛 Bugs</div>
            </div>
            <div class="stat-item">
                <div class="stat-item-value" style="color: #ffc107;">${issuesByType.Security || 0}</div>
                <div class="stat-item-label">🔒 Security</div>
            </div>
            <div class="stat-item">
                <div class="stat-item-value" style="color: #17a2b8;">${issuesByType.Performance || 0}</div>
                <div class="stat-item-label">⚡ Performance</div>
            </div>
            <div class="stat-item">
                <div class="stat-item-value" style="color: #28a745;">${issuesByType.Quality || 0}</div>
                <div class="stat-item-label">✨ Quality</div>
            </div>
        </div>
    `;
}

// Update repo filters
function updateRepoFilters() {
    const repos = Object.keys(allSettings);
    const historyFilter = document.getElementById('history-repo-filter');
    const statsFilter = document.getElementById('stats-repo-filter');

    const updateFilter = (select) => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">All Repositories</option>' +
            repos.map(repo => `<option value="${repo}">${repo}</option>`).join('');
        if (repos.includes(currentValue)) {
            select.value = currentValue;
        }
    };

    updateFilter(historyFilter);
    updateFilter(statsFilter);
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icon = type === 'success' ? '✓' : '✗';
    notification.innerHTML = `
        <span style="font-size: 1.25rem; font-weight: bold;">${icon}</span>
        <span>${message}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Note: CSS animations are already defined in styles.css, no need to add them here
