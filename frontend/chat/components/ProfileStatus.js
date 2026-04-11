function esc(value) {
  var el = document.createElement('div');
  el.appendChild(document.createTextNode(String(value || '')));
  return el.innerHTML;
}

export function derivePresenceLabel(status) {
  if (!status || status.showStatus === false) return '';
  if (status.isOnline) return 'Online';
  if (status.lastSeen) return 'Last seen ' + String(status.lastSeen);
  return 'Offline';
}

export function profileStatusTemplate(status) {
  var label = derivePresenceLabel(status);
  var showStatus = !(status && status.showStatus === false);
  var statusClass = status && status.isOnline ? 'online' : 'offline';
  var statusMarkup = showStatus
    ? '<span class="status ' + statusClass + '">' + esc(label || 'Offline') + '</span>'
    : '';

  return '<section class="vmp-card">' +
    '<div class="vmp-section-title">Live Status</div>' +
    '<div class="vmp-status-row"><span>Status</span>' + statusMarkup + '</div>' +
    '<div class="status-toggle"><span>Show my status</span><label class="switch"><input type="checkbox" id="statusVisibility" ' + (showStatus ? 'checked' : '') + '><span class="slider"></span></label></div>' +
    '</section>';
}
