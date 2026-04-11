function esc(value) {
  var el = document.createElement('div');
  el.appendChild(document.createTextNode(String(value || '')));
  return el.innerHTML;
}

export function derivePresenceLabel(status) {
  if (!status || status.visibility === false) return 'Offline';
  if (status.isTyping) return 'Typing';
  if (status.isOnline) return 'Online';
  return 'Offline';
}

export function profileStatusTemplate(status) {
  var label = derivePresenceLabel(status);
  var visible = !(status && status.visibility === false);
  var lastSeen = status && status.lastSeen ? String(status.lastSeen) : '—';

  return '<section class="vmp-card">' +
    '<div class="vmp-section-title">Live Status</div>' +
    '<div class="vmp-status-row"><span>Status</span><strong>' + esc(label) + '</strong></div>' +
    '<div class="vmp-status-row"><span>Last seen</span><span>' + esc(lastSeen) + '</span></div>' +
    '<label class="vmp-toggle"><input type="checkbox" id="vmpVisibilityToggle" ' + (visible ? 'checked' : '') + '><span>Show my status</span></label>' +
    '</section>';
}
