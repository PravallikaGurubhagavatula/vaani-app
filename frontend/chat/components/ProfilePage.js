import { profileHeaderTemplate } from './ProfileHeader.js';
import { profileInfoTemplate } from './ProfileInfo.js';
import { profileStatusTemplate } from './ProfileStatus.js';
import { profileAboutTemplate } from './ProfileAbout.js';
import { profileSkeletonTemplate } from './ProfileSkeleton.js';

export function profilePageSkeleton() {
  return '<div class="vmp-shell">' + profileSkeletonTemplate() + '</div>';
}

export function profilePageTemplate(state) {
  return '<div class="vmp-shell">' +
    profileHeaderTemplate(state.isEditing) +
    profileInfoTemplate(state.profile, state.isEditing) +
    profileStatusTemplate(state.status) +
    profileAboutTemplate(state.profile, state.isEditing) +
    '</div>';
}
