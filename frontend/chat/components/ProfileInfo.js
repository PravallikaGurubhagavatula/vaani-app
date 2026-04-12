// ProfileInfo.js — Vaani Profile Card v5.0
// Clean vmp-* system. No pm-* classes. No banner layout.

function esc(value) {
  var el = document.createElement('div');
  el.appendChild(document.createTextNode(String(value || '')));
  return el.innerHTML;
}

export function profileInfoTemplate(profile, isEditing) {
  var name     = profile.name     || 'Unnamed User';
  var username = profile.username || 'user';
  var photoURL = profile.photoURL || '';
  var fallback = (name.charAt(0) || 'U').toUpperCase();

  return (
    '<section class="vmp-info-card">' +
      // ── Avatar block ──────────────────────────────────────────
      '<div class="vmp-avatar-block">' +
        (photoURL
          ? '<img src="' + esc(photoURL) + '" class="vmp-avatar-img" alt="' + esc(name) + '"' +
            ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
            '<div class="vmp-avatar-fallback" style="display:none;">' + esc(fallback) + '</div>'
          : '<div class="vmp-avatar-fallback">' + esc(fallback) + '</div>') +
        (isEditing
          ? '<label class="vmp-avatar-edit-overlay" for="vmpPhotoInput" title="Change photo">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
                '<circle cx="12" cy="13" r="4"/>' +
              '</svg>' +
            '</label>'
          : '') +
      '</div>' +
      '<input id="vmpPhotoInput" class="vmp-hidden-input" type="file" accept="image/*">' +

      // ── Name & username ───────────────────────────────────────
      '<div class="vmp-identity-block">' +
        '<div class="vmp-card-name">' + esc(name) + '</div>' +
        '<div class="vmp-card-username">@' + esc(username) + '</div>' +
      '</div>' +
    '</section>'
  );
}

export function profileHeaderTemplate(isEditing) {
  return (
    '<div class="vmp-header profile-header">' +
      '<h2 class="vmp-title">My Profile</h2>' +
      '<button type="button" class="vmp-edit-btn" id="vmpEditBtn">' +
        (isEditing ? 'Editing…' : 'Edit Profile') +
      '</button>' +
    '</div>'
  );
}
