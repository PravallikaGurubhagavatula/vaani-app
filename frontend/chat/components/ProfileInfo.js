function esc(value) {
  var el = document.createElement('div');
  el.appendChild(document.createTextNode(String(value || '')));
  return el.innerHTML;
}

export function profileInfoTemplate(profile, isEditing) {
  var name = profile.name || 'Unnamed User';
  var username = profile.username || 'user';
  var photoURL = profile.photoURL || '';
  var fallback = (name.charAt(0) || 'U').toUpperCase();

  return '<section class="vmp-card vmp-info">' +
    '<div class="vmp-img-wrap">' +
      (photoURL
        ? '<img src="' + esc(photoURL) + '" class="vmp-photo" alt="Profile photo">'
        : '<div class="vmp-photo-fallback">' + esc(fallback) + '</div>') +
      '<div class="vmp-img-overlay"></div>' +
      (isEditing ? '<div class="vmp-edit-overlay" id="vmpEditPhoto"><span>Change photo</span></div>' : '') +
      '<div class="vmp-identity">' +
        '<div class="vmp-identity-name">' + esc(name) + '</div>' +
        '<div class="vmp-identity-user">@' + esc(username) + '</div>' +
      '</div>' +
    '</div>' +
    '<input id="vmpPhotoInput" class="vmp-hidden-input" type="file" accept="image/*">' +
    '</section>';
}
