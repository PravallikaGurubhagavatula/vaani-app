export function profileHeaderTemplate(isEditing) {
  return '<div class="vmp-header profile-header">' +
    '<h2 class="vmp-title">My Profile</h2>' +
    '<button type="button" class="vmp-edit-btn" id="vmpEditBtn">' + (isEditing ? 'Editing…' : 'Edit Profile') + '</button>' +
    '</div>';
}
