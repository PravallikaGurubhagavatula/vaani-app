/**
 * Vaani – User Profile View (Read-Only)
 * renderUserProfile(user) — drops profile UI into #profile-root
 *
 * @param {Object} user
 * @param {string}  user.name
 * @param {string}  user.username
 * @param {string}  user.email
 * @param {string}  user.uid
 * @param {string[]} user.languages
 * @param {string}  user.avatarUrl
 * @param {string}  user.city
 * @param {string}  user.state
 * @param {string}  user.joinedDate
 * @param {string}  [user.bio]
 * @param {Object}  [user.links]
 * @param {string}  [user.links.instagram]
 * @param {string}  [user.links.linkedin]
 * @param {string}  [user.links.website]
 */
function renderUserProfile(user) {
  const root = document.getElementById('profile-root');
  if (!root) return;

  // ── helpers ──────────────────────────────────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const fmt_date = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  const initials = (name) => {
    const parts = (name || '').trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (parts[0] || '?')[0].toUpperCase();
  };

  // ── SVG icons ─────────────────────────────────────────────────────────────
  const icons = {
    dots: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
    </svg>`,
    location: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>`,
    lang: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
      <path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/>
    </svg>`,
    chat: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`,
    profile: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>`,
    mute: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>`,
    block: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>`,
    report: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
    instagram: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>`,
    linkedin: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
    </svg>`,
    website: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>`,
  };

  // ── Build hero image / initials ───────────────────────────────────────────
  const heroMedia = user.avatarUrl
    ? `<img class="vp-hero__img" src="${esc(user.avatarUrl)}" alt="${esc(user.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
       <div class="vp-hero__initials" style="display:none;">${esc(initials(user.name))}</div>`
    : `<div class="vp-hero__initials">${esc(initials(user.name))}</div>`;

  // ── Location ──────────────────────────────────────────────────────────────
  const locationParts = [user.city, user.state].filter(Boolean);
  const locationHTML = locationParts.length
    ? `<span class="vp-meta__item">${icons.location}<span>${esc(locationParts.join(', '))}</span></span>`
    : '';

  // ── Language tags ─────────────────────────────────────────────────────────
  const langs = Array.isArray(user.languages) ? user.languages : [];
  const langTagsHTML = langs.length
    ? `<span class="vp-meta__item">${icons.lang}</span>
       <ul class="vp-lang-list">${langs.map(l => `<li class="vp-lang-tag">${esc(l)}</li>`).join('')}</ul>`
    : '';

  // ── External links ────────────────────────────────────────────────────────
  const links = user.links || {};
  const linkButtons = [
    links.instagram && `<a class="vp-link-btn" href="${esc(links.instagram)}" target="_blank" rel="noopener">${icons.instagram}Instagram</a>`,
    links.linkedin  && `<a class="vp-link-btn" href="${esc(links.linkedin)}"  target="_blank" rel="noopener">${icons.linkedin}LinkedIn</a>`,
    links.website   && `<a class="vp-link-btn" href="${esc(links.website)}"   target="_blank" rel="noopener">${icons.website}Website</a>`,
  ].filter(Boolean);

  const linksRow = linkButtons.length
    ? `<div class="vp-links">${linkButtons.join('')}</div>`
    : '';

  // ── Bio card ──────────────────────────────────────────────────────────────
  const bioCard = user.bio
    ? `<div class="glass-card vp-bio">
         <div class="vp-bio__label">About</div>
         <p class="vp-bio__text">${esc(user.bio)}</p>
       </div>`
    : '';

  // ── Language field value ──────────────────────────────────────────────────
  const langFieldHTML = langs.length
    ? `<div class="vp-field__tags">${langs.map(l => `<span class="vp-lang-tag">${esc(l)}</span>`).join('')}</div>`
    : '<span class="vp-field__val">—</span>';

  // ── Full markup ───────────────────────────────────────────────────────────
  const html = `
  <div class="vp-wrapper">

    <!-- HERO CARD -->
    <div class="glass-card vp-hero">
      <div class="vp-hero__img-wrap">
        ${heroMedia}
        <div class="vp-hero__overlay"></div>
        <div class="vp-hero__identity">
          <div class="vp-hero__name">${esc(user.name)}</div>
          <div class="vp-hero__username">@${esc(user.username)}</div>
        </div>
      </div>

      <!-- 3-dot menu -->
      <button class="vp-hero__menu-btn" id="vp-menu-btn" aria-label="Options" aria-expanded="false">
        ${icons.dots}
      </button>

      <!-- Dropdown -->
      <div class="vp-dropdown" id="vp-dropdown" role="menu">
        <button class="vp-dropdown__item" data-action="view-profile">${icons.profile} View Full Profile</button>
        <button class="vp-dropdown__item" data-action="mute">${icons.mute} Mute User</button>
        <div class="vp-dropdown__sep"></div>
        <button class="vp-dropdown__item danger" data-action="block">${icons.block} Block User</button>
        <button class="vp-dropdown__item danger" data-action="report">${icons.report} Report User</button>
      </div>

      <!-- Meta + actions -->
      <div class="vp-hero__bottom">
        <div class="vp-meta">
          ${locationHTML}
          ${langTagsHTML}
        </div>

        ${linksRow}

        <div class="vp-actions">
          <button class="btn-primary" id="vp-msg-btn">${icons.chat} Message</button>
        </div>
      </div>
    </div>

    <!-- BIO CARD (optional) -->
    ${bioCard}

    <!-- PERSONAL DETAILS -->
    <div class="glass-card vp-section">
      <div class="vp-section__title">Personal Details</div>
      <div class="vp-field-list">
        <div class="vp-field">
          <span class="vp-field__key">Full Name</span>
          <span class="vp-field__val">${esc(user.name) || '—'}</span>
        </div>
        <div class="vp-field">
          <span class="vp-field__key">Username</span>
          <span class="vp-field__val">@${esc(user.username) || '—'}</span>
        </div>
        <div class="vp-field">
          <span class="vp-field__key">Languages</span>
          ${langFieldHTML}
        </div>
      </div>
    </div>

    <!-- ACCOUNT DETAILS -->
    <div class="glass-card vp-section">
      <div class="vp-section__title">Account Details</div>
      <div class="vp-field-list">
        <div class="vp-field">
          <span class="vp-field__key">Email</span>
          <span class="vp-field__val">${esc(user.email) || '—'}</span>
        </div>
        <div class="vp-field">
          <span class="vp-field__key">User ID</span>
          <span class="vp-field__val uid">${esc(user.uid) || '—'}</span>
        </div>
        <div class="vp-field">
          <span class="vp-field__key">Joined</span>
          <span class="vp-field__val">${fmt_date(user.joinedDate)}</span>
        </div>
      </div>
    </div>

  </div>`;

  root.innerHTML = html;

  // ── Dropdown toggle ───────────────────────────────────────────────────────
  const menuBtn  = root.querySelector('#vp-menu-btn');
  const dropdown = root.querySelector('#vp-dropdown');

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== menuBtn) {
      dropdown.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  }, { capture: true });

  // ── Dropdown actions ──────────────────────────────────────────────────────
  dropdown.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.action;
      dropdown.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      // Emit a custom event so the host app can handle it
      root.dispatchEvent(new CustomEvent('vaani:profile-action', {
        bubbles: true,
        detail: { action, user }
      }));
    });
  });

  // ── Message button ────────────────────────────────────────────────────────
  root.querySelector('#vp-msg-btn').addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('vaani:profile-action', {
      bubbles: true,
      detail: { action: 'message', user }
    }));
  });
}