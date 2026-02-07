// Landing Page JavaScript

// Show login modal
function showLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close login modal
function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Close modal when clicking outside
document.getElementById('loginModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'loginModal') {
        closeLoginModal();
    }
});

// Handle login form submission
function handleLogin(event) {
    event.preventDefault();
    
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const rememberInput = document.getElementById('remember');
    
    if (!usernameInput || !passwordInput) {
        console.error('Login form elements not found');
        return;
    }
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const remember = rememberInput ? rememberInput.checked : false;
    
    // Simple authentication (for demo purposes)
    // In production, this would call an API
    if (username && password) {
        // Store authentication state
        const authData = {
            username: username,
            timestamp: Date.now(),
            remember: remember
        };
        
        localStorage.setItem('gitguard_auth', JSON.stringify(authData));
        
        // Close modal
        closeLoginModal();
        
        // Redirect to dashboard
        window.location.href = '/dashboard.html';
    } else {
        alert('Please enter both username and password');
    }
}

// Handle demo login (no credentials required)
function handleDemoLogin() {
    const authData = {
        username: 'demo',
        timestamp: Date.now(),
        remember: true,
        demo: true
    };
    
    localStorage.setItem('gitguard_auth', JSON.stringify(authData));
    window.location.href = '/dashboard.html';
}

// Check if user is already logged in
function checkAuth() {
    const auth = localStorage.getItem('gitguard_auth');
    if (auth) {
        try {
            const authData = JSON.parse(auth);
            // Check if session is still valid (24 hours)
            const sessionDuration = 24 * 60 * 60 * 1000;
            if (Date.now() - authData.timestamp < sessionDuration) {
                // User is logged in, redirect to dashboard
                window.location.href = '/dashboard.html';
            } else {
                // Session expired
                localStorage.removeItem('gitguard_auth');
            }
        } catch (e) {
            localStorage.removeItem('gitguard_auth');
        }
    }
}

// Check auth on page load
checkAuth();

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
