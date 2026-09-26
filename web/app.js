const deviceId = 'demo-display';
const $ = (id) => document.getElementById(id);
const dialog = $('configDialog');

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderDepartures(departures) {
  const container = $('departures');
  container.replaceChildren();
  if (!departures.length) {
    container.append(textElement('p', 'empty', 'No departures found for this display.'));
    return;
  }
  for (const item of departures) {
    const article = textElement('article', 'departure', '');
    article.append(textElement('div', 'line', item.line));
    const details = textElement('div', 'details', '');
    details.append(textElement('strong', '', item.destination));
    details.append(textElement('span', '', `${item.status}${item.platform ? ` · platform ${item.platform}` : ''}`));
    article.append(details);
    const time = textElement('div', 'time', '');
    time.append(textElement('strong', '', item.expectedTime));
    time.append(textElement('span', '', item.delayMinutes > 0 ? `+${item.delayMinutes} min` : item.scheduledTime));
    article.append(time);
    container.append(article);
  }
}

function render(data) {
  $('stop').textContent = data.stop.name;
  $('direction').textContent = data.stop.direction;
  $('freshness').textContent = `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  $('status').textContent = data.stale ? 'Data may be out of date' : `${data.departures.length} upcoming departures`;
  $('status').className = `status ${data.stale ? 'warning' : ''}`;
  renderDepartures(data.departures);
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
