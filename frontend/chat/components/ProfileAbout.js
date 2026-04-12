// ProfileAbout.js

function esc(value) {
  var el = document.createElement('div');
  el.appendChild(document.createTextNode(String(value || '')));
  return el.innerHTML;
}

function fieldView(label, value) {
  return '<div class="vmp-about-row"><div class="vmp-about-label">' + esc(label) + '</div><div class="vmp-about-value">' + esc(value || '—') + '</div></div>';
}

function fieldInput(label, id, value, placeholder) {
  return '<label class="vmp-field"><span>' + esc(label) + '</span><input id="' + esc(id) + '" class="vmp-input" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '"></label>';
}

// ── SOCIAL LINKS ──────────────────────────────────────────────────

var _socialIconMap = {
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
  linkedin:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
  twitter:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16M4 20L20 4"/><path d="M20 4h-5l-11 16h5"/></svg>',
  threads:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c2.76 0 5.26-1.12 7.07-2.93"/><path d="M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4v1c0 2.21-1.79 4-4 4"/><circle cx="12" cy="13" r="1"/></svg>',
  snapchat:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 2 6 5 6 8v1c-1 0-2 .5-2 1.5S5 12 6 12c-.5 2-2 3-3 3.5 1 .5 3 1 4 1 .5 1 1.5 1.5 5 1.5s4.5-.5 5-1.5c1 0 3-.5 4-1-1-.5-2.5-1.5-3-3.5 1 0 2-.5 2-1.5S19 10 18 10V8c0-3-2-6-6-6z"/></svg>',
  custom:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};

export function detectPlatform(url) {
  var u = (url || '').toLowerCase();
  if (u.includes('instagram.com'))            return 'instagram';
  if (u.includes('linkedin.com'))             return 'linkedin';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('threads.net'))              return 'threads';
  if (u.includes('snapchat.com'))             return 'snapchat';
  return 'custom';
}

export function getSocialIcon(type) {
  return _socialIconMap[type] || _socialIconMap.custom;
}

function _socialLinksView(links) {
  if (!links || !links.length) return '';
  var icons = links.map(function(link) {
    var type = link.type || detectPlatform(link.url);
    var icon = getSocialIcon(type);
    var label = type.charAt(0).toUpperCase() + type.slice(1);
    return '<a href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer" class="vmp-social-icon" title="' + esc(label) + '">' + icon + '</a>';
  }).join('');
  return '<div class="vmp-social-icons">' + icons + '</div>';
}

function _socialLinksEdit(links) {
  var rows = (links || []).map(function(link, i) {
    return '<div class="vmp-social-row" data-idx="' + i + '">' +
      '<input class="vmp-input vmp-social-input" value="' + esc(link.url || '') + '" placeholder="https://instagram.com/username">' +
      '<button type="button" class="vmp-social-remove" data-idx="' + i + '" title="Remove">×</button>' +
    '</div>';
  }).join('');
  return '<div class="vmp-social-edit" id="vmpSocialList">' + rows + '</div>' +
    '<button type="button" class="vmp-social-add" id="vmpAddSocialBtn">+ Add Social Link</button>';
}

export function profileAboutTemplate(profile, isEditing) {
  var interestsValue = Array.isArray(profile.interests) ? profile.interests.join(', ') : (profile.interests || '');
  var socialLinks = Array.isArray(profile.socialLinks) ? profile.socialLinks : [];

  var body = isEditing
    ? (
      '<div class="vmp-edit-grid">' +
      fieldInput('Name', 'vmpName', profile.name, 'Your name') +
      fieldInput('Username', 'vmpUsername', profile.username, 'your_id') +
      fieldInput('Bio', 'vmpBio', profile.bio, 'Short bio') +
      fieldInput('Interests', 'vmpInterests', interestsValue, 'Travel, Music') +
      fieldInput('Location', 'vmpLocation', profile.location, 'City, Country') +
      '</div>' +
      '<div class="vmp-section-title vmp-social-section-title">Social Links</div>' +
      _socialLinksEdit(socialLinks)
    )
    : (
      fieldView('Bio', profile.bio) +
      fieldView('Interests', interestsValue) +
      fieldView('Location', profile.location) +
      _socialLinksView(socialLinks)
    );

  var actions = isEditing
    ? '<div class="vmp-actions"><button id="vmpSaveBtn" class="vmp-save" type="button">Save</button><button id="vmpCancelBtn" class="vmp-cancel" type="button">Cancel</button></div>'
    : '';

  return '<section class="vmp-card"><div class="vmp-section-title">About</div>' + body + actions + '</section>';
}
