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

export function profileAboutTemplate(profile, isEditing) {
  var interestsValue = Array.isArray(profile.interests) ? profile.interests.join(', ') : (profile.interests || '');

  var body = isEditing
    ? (
      '<div class="vmp-edit-grid">' +
      fieldInput('Name', 'vmpName', profile.name, 'Your name') +
      fieldInput('Username', 'vmpUsername', profile.username, 'your_id') +
      fieldInput('Bio', 'vmpBio', profile.bio, 'Short bio') +
      fieldInput('Interests', 'vmpInterests', interestsValue, 'Travel, Music') +
      fieldInput('Location', 'vmpLocation', profile.location, 'City, Country') +
      '</div>'
    )
    : (
      fieldView('Bio', profile.bio) +
      fieldView('Interests', interestsValue) +
      fieldView('Location', profile.location)
    );

  var actions = isEditing
    ? '<div class="vmp-actions"><button id="vmpSaveBtn" class="vmp-save" type="button">Save</button><button id="vmpCancelBtn" class="vmp-cancel" type="button">Cancel</button></div>'
    : '';

  return '<section class="vmp-card"><div class="vmp-section-title">About</div>' + body + actions + '</section>';
}
