const COLORS = [
  { value: 'red', label: 'Rouge' },
  { value: 'coral', label: 'Corail' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Jaune' },
  { value: 'green', label: 'Vert' },
  { value: 'mint', label: 'Menthe' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'blue', label: 'Bleu' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'purple', label: 'Violet' },
  { value: 'pink', label: 'Rose' },
  { value: 'white', label: 'Blanc' }
];

const STYLES = [
  { value: 'arcade', label: 'Arcade', description: 'Relief classique' },
  { value: 'neon', label: 'Néon', description: 'Anneau lumineux' },
  { value: 'flat', label: 'Plat', description: 'Simple et moderne' },
  { value: 'vinyl', label: 'Vinyle', description: 'Musical et tactile' },
  { value: 'wave', label: 'Onde', description: 'Numérique et dynamique' },
  { value: 'glass', label: 'Verre', description: 'Doux et premium' }
];

const elements = {
  appShell: document.querySelector('#app-shell'),
  loginDialog: document.querySelector('#login-dialog'),
  loginForm: document.querySelector('#login-form'),
  loginPassword: document.querySelector('#login-password'),
  loginError: document.querySelector('#login-error'),
  loginSubmit: document.querySelector('#login-submit'),
  roleBadge: document.querySelector('#role-badge'),
  addProfile: document.querySelector('#add-profile-button'),
  logout: document.querySelector('#logout-button'),
  tabs: document.querySelector('#profile-tabs'),
  welcome: document.querySelector('#welcome'),
  board: document.querySelector('#board'),
  title: document.querySelector('#profile-title'),
  grid: document.querySelector('#sound-grid'),
  noSounds: document.querySelector('#no-sounds'),
  profileDialog: document.querySelector('#profile-dialog'),
  profileForm: document.querySelector('#profile-form'),
  profileDialogTitle: document.querySelector('#profile-dialog-title'),
  profileName: document.querySelector('#profile-name'),
  profileError: document.querySelector('#profile-error'),
  deleteProfile: document.querySelector('#delete-profile-button'),
  editProfile: document.querySelector('#edit-profile-button'),
  soundDialog: document.querySelector('#sound-dialog'),
  soundForm: document.querySelector('#sound-form'),
  soundDialogTitle: document.querySelector('#sound-dialog-title'),
  soundName: document.querySelector('#sound-name'),
  soundFile: document.querySelector('#sound-file'),
  soundUrl: document.querySelector('#sound-url'),
  fileField: document.querySelector('#file-field'),
  urlField: document.querySelector('#url-field'),
  sourceSwitch: document.querySelector('#source-switch'),
  colorOptions: document.querySelector('#color-options'),
  styleOptions: document.querySelector('#style-options'),
  soundError: document.querySelector('#sound-error'),
  soundSubmit: document.querySelector('#sound-submit-button'),
  deleteSound: document.querySelector('#delete-sound-button'),
  toast: document.querySelector('#toast')
};

const state = {
  role: null,
  profiles: [],
  activeProfileId: null,
  sounds: [],
  editingSound: null,
  source: 'url',
  audio: null,
  audioSoundId: null,
  audioButton: null,
  audioStarting: false
};
let toastTimer;

async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/auth/login') showLogin();
    throw new Error(body.error || `Erreur HTTP ${response.status}`);
  }
  return body;
}

function isAdmin() { return state.role === 'admin'; }

function showLogin() {
  state.role = null;
  stopAudio();
  elements.appShell.hidden = true;
  document.querySelectorAll('dialog[open]').forEach((dialog) => {
    if (dialog !== elements.loginDialog) dialog.close();
  });
  elements.loginError.textContent = '';
  elements.loginForm.reset();
  if (!elements.loginDialog.open) elements.loginDialog.showModal();
  elements.loginPassword.focus();
}

function showApp(role) {
  state.role = role;
  elements.appShell.hidden = false;
  elements.roleBadge.textContent = role === 'admin' ? 'Mode admin' : 'Utilisateur';
  elements.roleBadge.classList.toggle('admin', role === 'admin');
  elements.addProfile.hidden = role !== 'admin';
  if (elements.loginDialog.open) elements.loginDialog.close();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 2500);
}

function activeProfile() { return state.profiles.find((profile) => profile.id === state.activeProfileId); }

function renderProfiles() {
  elements.tabs.replaceChildren();
  for (const profile of state.profiles) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `tab${profile.id === state.activeProfileId ? ' active' : ''}`;
    tab.textContent = profile.name;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(profile.id === state.activeProfileId));
    tab.addEventListener('click', () => selectProfile(profile.id));
    elements.tabs.append(tab);
  }
  const empty = state.profiles.length === 0;
  elements.welcome.hidden = !empty;
  elements.board.hidden = empty;
  elements.editProfile.hidden = empty || !isAdmin();
  document.querySelector('#welcome-profile-button').hidden = !isAdmin();
  document.querySelector('#welcome-title').textContent = isAdmin() ? 'Créez votre premier profil' : 'Aucun profil disponible';
  document.querySelector('#welcome-copy').textContent = isAdmin()
    ? 'Chaque personne dispose de son onglet et de ses propres boutons.'
    : 'Un administrateur doit créer un profil avant de pouvoir ajouter des sons.';
  if (!empty) elements.title.textContent = activeProfile()?.name || '';
}

function stopAudio() {
  if (!state.audio) return;
  state.audio.pause();
  state.audio.currentTime = 0;
  state.audioButton?.classList.remove('playing');
  state.audio = null;
  state.audioSoundId = null;
  state.audioButton = null;
  state.audioStarting = false;
  document.querySelectorAll('.sound-button.playing').forEach((button) => button.classList.remove('playing'));
}

function playSound(sound, button) {
  if (state.audio && state.audioSoundId === sound.id) {
    if (state.audioStarting) return;
    state.audio.currentTime = 0;
    state.audio.play().catch(() => {
      if (state.audioSoundId === sound.id) showToast('Impossible de lire ce son');
    });
    return;
  }

  stopAudio();
  const audio = new Audio(sound.audio_url);
  audio.preload = 'auto';
  state.audio = audio;
  state.audioSoundId = sound.id;
  state.audioButton = button;
  state.audioStarting = true;
  button.classList.add('playing');
  const clear = () => {
    button.classList.remove('playing');
    if (state.audio === audio) {
      state.audio = null;
      state.audioSoundId = null;
      state.audioButton = null;
      state.audioStarting = false;
    }
  };
  audio.addEventListener('ended', clear, { once: true });
  audio.addEventListener('error', () => { clear(); showToast('Impossible de lire ce son'); }, { once: true });
  audio.play()
    .then(() => { if (state.audio === audio) state.audioStarting = false; })
    .catch(() => {
      if (state.audio !== audio) return;
      clear();
      showToast('Lecture audio bloquée');
    });
}

function renderSounds() {
  elements.grid.replaceChildren();
  elements.noSounds.hidden = state.sounds.length !== 0;
  for (const sound of state.sounds) {
    const card = document.createElement('article');
    card.className = 'sound-card';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sound-button color-${sound.color} style-${sound.style || 'arcade'}`;
    button.setAttribute('aria-label', `Jouer ${sound.name}`);
    const light = document.createElement('span');
    light.className = 'arcade-light';
    light.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'sound-name';
    name.textContent = sound.name;
    button.append(light, name);
    button.addEventListener('click', () => playSound(sound, button));

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'sound-edit';
    edit.textContent = '•••';
    edit.setAttribute('aria-label', `Modifier ${sound.name}`);
    edit.addEventListener('click', () => openSoundDialog(sound));
    card.append(button, edit);
    elements.grid.append(card);
  }
}

async function selectProfile(id) {
  state.activeProfileId = id;
  stopAudio();
  renderProfiles();
  try {
    state.sounds = await api(`/api/profiles/${id}/sounds`);
    if (state.activeProfileId === id) renderSounds();
  } catch (error) { showToast(error.message); }
}

function openProfileDialog(editing = false) {
  const profile = editing ? activeProfile() : null;
  elements.profileForm.reset();
  elements.profileError.textContent = '';
  elements.profileDialogTitle.textContent = profile ? 'Modifier le profil' : 'Nouvelle personne';
  elements.profileName.value = profile?.name || '';
  elements.deleteProfile.hidden = !profile;
  elements.profileDialog.dataset.mode = profile ? 'edit' : 'create';
  elements.profileDialog.showModal();
  elements.profileName.focus();
}

function setSource(source) {
  state.source = source;
  elements.sourceSwitch.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.source === source));
  elements.fileField.hidden = source !== 'file';
  elements.urlField.hidden = source !== 'url';
  elements.soundFile.required = source === 'file';
  elements.soundUrl.required = source === 'url';
}

function selectedColor() { return elements.colorOptions.querySelector('input:checked')?.value || 'red'; }
function selectedStyle() { return elements.styleOptions.querySelector('input:checked')?.value || 'arcade'; }

function openSoundDialog(sound = null) {
  state.editingSound = sound;
  elements.soundForm.reset();
  elements.soundError.textContent = '';
  elements.soundDialogTitle.textContent = sound ? 'Modifier le bouton' : 'Ajouter un son';
  elements.soundSubmit.textContent = sound ? 'Enregistrer' : 'Ajouter';
  elements.deleteSound.hidden = !sound;
  elements.sourceSwitch.hidden = Boolean(sound);
  elements.fileField.hidden = Boolean(sound);
  elements.urlField.hidden = true;
  if (sound) {
    elements.soundName.value = sound.name;
    const input = elements.colorOptions.querySelector(`input[value="${sound.color}"]`);
    if (input) input.checked = true;
    const styleInput = elements.styleOptions.querySelector(`input[value="${sound.style || 'arcade'}"]`);
    if (styleInput) styleInput.checked = true;
    elements.soundFile.required = false;
    elements.soundUrl.required = false;
  } else {
    setSource('url');
    const red = elements.colorOptions.querySelector('input[value="red"]');
    if (red) red.checked = true;
    const arcade = elements.styleOptions.querySelector('input[value="arcade"]');
    if (arcade) arcade.checked = true;
  }
  elements.soundDialog.showModal();
  elements.soundName.focus();
}

async function load() {
  try {
    state.profiles = await api('/api/profiles');
    const previous = state.profiles.find((profile) => profile.id === state.activeProfileId);
    state.activeProfileId = previous?.id ?? state.profiles[0]?.id ?? null;
    renderProfiles();
    if (state.activeProfileId) await selectProfile(state.activeProfileId);
  } catch (error) { showToast(error.message); }
}

async function initialize() {
  try {
    const session = await api('/api/auth/session');
    showApp(session.role);
    await load();
  } catch (error) {
    if (state.role) showToast(error.message);
  }
}

COLORS.forEach((color, index) => {
  const label = document.createElement('label');
  label.className = 'color-choice';
  label.title = color.label;
  label.setAttribute('aria-label', color.label);
  const input = document.createElement('input');
  input.type = 'radio'; input.name = 'color'; input.value = color.value; input.checked = index === 0;
  const swatch = document.createElement('span');
  swatch.className = `color-swatch color-${color.value}`;
  label.append(input, swatch);
  elements.colorOptions.append(label);
});

STYLES.forEach((style, index) => {
  const label = document.createElement('label');
  label.className = 'style-choice';
  const input = document.createElement('input');
  input.type = 'radio'; input.name = 'style'; input.value = style.value; input.checked = index === 0;
  const preview = document.createElement('span');
  preview.className = `style-preview style-${style.value}`;
  const light = document.createElement('span');
  light.className = 'arcade-light';
  light.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.className = 'style-copy';
  const name = document.createElement('strong');
  name.textContent = style.label;
  const description = document.createElement('small');
  description.textContent = style.description;
  copy.append(name, description);
  preview.append(light, copy);
  label.append(input, preview);
  elements.styleOptions.append(label);
});

document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
elements.loginDialog.addEventListener('cancel', (event) => event.preventDefault());
elements.addProfile.addEventListener('click', () => openProfileDialog(false));
document.querySelector('#welcome-profile-button').addEventListener('click', () => openProfileDialog(false));
elements.editProfile.addEventListener('click', () => openProfileDialog(true));
document.querySelector('#add-sound-button').addEventListener('click', () => openSoundDialog());
document.querySelector('#empty-add-sound-button').addEventListener('click', () => openSoundDialog());
elements.sourceSwitch.addEventListener('click', (event) => {
  const button = event.target.closest('[data-source]');
  if (button) setSource(button.dataset.source);
});

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.loginError.textContent = '';
  elements.loginSubmit.disabled = true;
  try {
    const session = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: elements.loginPassword.value })
    });
    showApp(session.role);
    await load();
  } catch (error) {
    elements.loginError.textContent = error.message;
    elements.loginPassword.select();
  } finally {
    elements.loginSubmit.disabled = false;
  }
});

elements.logout.addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* La session est déjà inutilisable. */ }
  state.profiles = [];
  state.sounds = [];
  state.activeProfileId = null;
  showLogin();
});

elements.profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.profileError.textContent = '';
  const editing = elements.profileDialog.dataset.mode === 'edit';
  try {
    const profile = await api(editing ? `/api/profiles/${state.activeProfileId}` : '/api/profiles', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: elements.profileName.value })
    });
    elements.profileDialog.close();
    if (!editing) state.activeProfileId = profile.id;
    await load();
    showToast(editing ? 'Profil renommé' : 'Profil créé');
  } catch (error) { elements.profileError.textContent = error.message; }
});

elements.deleteProfile.addEventListener('click', async () => {
  const profile = activeProfile();
  if (!profile || !confirm(`Supprimer le profil « ${profile.name} » et tous ses sons ?`)) return;
  try {
    await api(`/api/profiles/${profile.id}`, { method: 'DELETE' });
    state.activeProfileId = null;
    elements.profileDialog.close();
    await load();
    showToast('Profil supprimé');
  } catch (error) { elements.profileError.textContent = error.message; }
});

elements.soundForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.soundError.textContent = '';
  elements.soundSubmit.disabled = true;
  try {
    if (state.editingSound) {
      await api(`/api/sounds/${state.editingSound.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: elements.soundName.value, color: selectedColor(), style: selectedStyle() })
      });
    } else if (state.source === 'file') {
      const data = new FormData();
      data.append('name', elements.soundName.value);
      data.append('color', selectedColor());
      data.append('style', selectedStyle());
      data.append('file', elements.soundFile.files[0]);
      await api(`/api/profiles/${state.activeProfileId}/sounds/upload`, { method: 'POST', body: data });
    } else {
      await api(`/api/profiles/${state.activeProfileId}/sounds/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: elements.soundName.value, color: selectedColor(), style: selectedStyle(), url: elements.soundUrl.value })
      });
    }
    elements.soundDialog.close();
    await selectProfile(state.activeProfileId);
    showToast(state.editingSound ? 'Bouton modifié' : 'Son ajouté');
  } catch (error) {
    elements.soundError.textContent = error.message;
  } finally { elements.soundSubmit.disabled = false; }
});

elements.deleteSound.addEventListener('click', async () => {
  const sound = state.editingSound;
  if (!sound || !confirm(`Supprimer « ${sound.name} » ?`)) return;
  try {
    await api(`/api/sounds/${sound.id}`, { method: 'DELETE' });
    elements.soundDialog.close();
    await selectProfile(state.activeProfileId);
    showToast('Son supprimé');
  } catch (error) { elements.soundError.textContent = error.message; }
});

initialize();
