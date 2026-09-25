const deviceId = 'demo-display';
const $ = (id) => document.getElementById(id);
const dialog = $('configDialog');

function render(data) {
  $('stop').textContent = data.stop.name;
  $('direction').textContent = data.stop.direction;
  $('freshness').textContent = `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  $('status').textContent = data.stale ? 'Data may be out of date' : `${data.departures.length} upcoming departures`;
  $('status').className = `status ${data.stale ? 'warning' : ''}`;
  $('departures').innerHTML = data.departures.length ? data.departures.map((item) => `<article class="departure"><div class="line">${item.line}</div><div class="details"><strong>${item.destination}</strong><span>${item.status}${item.platform ? ` · platform ${item.platform}` : ''}</span></div><div class="time"><strong>${item.expectedTime}</strong><span>${item.delayMinutes > 0 ? `+${item.delayMinutes} min` : item.scheduledTime}</span></div></article>`).join('') : '<p class="empty">No departures found for this display.</p>';
}

async function refresh() {
  try { render(await fetch(`/api/v1/display?deviceId=${encodeURIComponent(deviceId)}`).then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error))))); }
  catch (error) { $('status').textContent = `Unable to refresh: ${error.message}`; $('status').className = 'status warning'; }
}

$('setup').addEventListener('click', async () => {
  const config = await fetch(`/api/v1/devices/${deviceId}/config`).then((r) => r.json());
  for (const [key, value] of Object.entries(config)) if ($('configForm').elements[key]) $('configForm').elements[key].value = value ?? '';
  dialog.showModal();
});
$('configForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  payload.route = payload.route || null;
  try { await fetch(`/api/v1/devices/${deviceId}/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); }); dialog.close(); refresh(); }
  catch (error) { $('configError').textContent = error.message; }
});
setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 1000);
refresh();
