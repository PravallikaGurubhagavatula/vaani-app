function esc(value) {
  var el = document.createElement('div');
  el.appendChild(document.createTextNode(String(value || '')));
  return el.innerHTML;
}

export function profileInfoTemplate(profile, isEditing) {
  var name = profile.name || 'Unnamed User';
  var username = profile.username || 'user';
  var photoURL = profile.photoURL || '';
  var fallback = (name.charAt(0) || username.charAt(0) || 'U').toUpperCase();

  return '<section class="vmp-card vmp-info">' +
    '<button type="button" class="vmp-photo-btn" id="vmpPhotoBtn" title="Change photo">' +
      (photoURL
        ? '<img src="' + esc(photoURL) + '" class="vmp-photo" alt="Profile photo">'
        : '<span class="vmp-photo-fallback">' + esc(fallback) + '</span>') +
    '</button>' +
    '<input id="vmpPhotoInput" class="vmp-hidden-input" type="file" accept="image/*">' +
    '<button type="button" class="vmp-link-btn" id="vmpChangePhotoBtn">Change Photo</button>' +
    '<div class="vmp-name">' + esc(name) + '</div>' +
    '<div class="vmp-username">@' + esc(username) + '</div>' +
    (isEditing ? '<p class="vmp-muted">Photo updates save immediately.</p>' : '') +
    '</section>';
}
