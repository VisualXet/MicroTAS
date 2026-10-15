/**
 * EventTech Studio - Mobile App Logic para Técnicos de Sala
 * Basado en la arquitectura y experiencia visual de SEMERGEN.
 * 100% Autónomo, Offline, Mobile-First con persistencia localStorage.
 */

var eventData = window.__EVENT_DATA__ || null;

// Estados persistidos en localStorage
var selectedDayIdx = 0;
var selectedRooms = []; // lista de nombres de salas seleccionadas
var currentSearchTerm = '';
var currentVenue = 'all';
var isCompactView = false;
var globalShowSpeakers = true;
var visibleSpeakersMap = {};
var finishedSessionsMap = {};
var sessionNotesMap = {};
var currentEditingSessionId = null;

// Helpers de almacenamiento local seguro
function safeGet(key, defaultVal) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      var val = localStorage.getItem(key);
      return val ? JSON.parse(val) : defaultVal;
    }
  } catch (e) {}
  return defaultVal;
}

function safeSet(key, val) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      localStorage.setItem(key, JSON.stringify(val));
    }
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', async function() {
  initTheme();
  initClock();

  finishedSessionsMap = safeGet('event_finished_sessions_v1', {});
  sessionNotesMap = safeGet('event_session_notes_v1', {});
  isCompactView = safeGet('event_compact_view_v1', false);

  if (!eventData) {
    try {
      var res = await fetch('data/event_data.json');
      eventData = await res.json();
    } catch (e) {
      console.warn("No se pudo cargar event_data.json local.");
    }
  }

  if (eventData) {
    initApp();
  } else {
    var out = document.getElementById('schedule-output');
    if (out) out.innerHTML = '<div class="text-center py-12 text-slate-500">No se encontraron datos del evento.</div>';
  }
});

function initTheme() {
  var savedTheme = localStorage.getItem('tech_theme_mode');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    updateThemeButton(true);
  } else if (savedTheme === 'light') {
    document.body.classList.remove('dark-mode');
    updateThemeButton(false);
  } else {
    // Modo por defecto según configuración
    var defMode = eventData && eventData.theme && eventData.theme.default_mode;
    if (defMode === 'dark') {
      document.body.classList.add('dark-mode');
      updateThemeButton(true);
    }
  }
}

function toggleDarkMode() {
  var isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('tech_theme_mode', isDark ? 'dark' : 'light');
  updateThemeButton(isDark);
  showToast(isDark ? 'Modo Sala Oscura activado (Antideslumbrante)' : 'Modo Claro activado', 'fa-moon text-amber-400');
}

function updateThemeButton(isDark) {
  var icon = document.getElementById('theme-toggle-icon');
  var text = document.getElementById('theme-toggle-text');
  var mIcon = document.getElementById('mobile-theme-icon');
  var mText = document.getElementById('mobile-theme-text');
  if (icon) icon.className = isDark ? 'fa-solid fa-sun text-amber-400' : 'fa-solid fa-moon text-amber-300';
  if (text) text.textContent = isDark ? 'Modo Luz' : 'Modo Sala';
  if (mIcon) mIcon.className = isDark ? 'fa-solid fa-sun text-base text-amber-400' : 'fa-solid fa-moon text-base text-amber-500';
  if (mText) mText.textContent = isDark ? 'Modo Luz' : 'Modo Sala';
}

function initClock() {
  var clockEl = document.getElementById('clock-display');
  function update() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    if (clockEl) clockEl.textContent = h + ':' + m + ':' + s;
  }
  update();
  setInterval(update, 1000);
  setInterval(evaluateLiveSessions, 30000);
}

// INICIALIZACIÓN DE LA APLICACIÓN
function initApp() {
  var metadata = eventData.metadata || {};
  var config = eventData.config || {};
  var support = config.tech_support || {};

  // Configurar títulos y SOS
  var nameEl = document.getElementById('header-event-name');
  if (nameEl) nameEl.textContent = metadata.name || 'Web del Técnico';

  var datesEl = document.getElementById('header-event-dates');
  if (datesEl && metadata.dates) {
    datesEl.textContent = (metadata.dates.start || '') + ' al ' + (metadata.dates.end || '');
  }

  var btnSos = document.getElementById('btn-sos-header');
  if (btnSos) {
    if (support.phone_whatsapp) {
      var cleanPhone = support.phone_whatsapp.replace(/[^0-9+]/g, '');
      var msg = encodeURIComponent('Hola soporte técnico, necesito asistencia en la sala:');
      btnSos.href = 'https://wa.me/' + cleanPhone.replace('+', '') + '?text=' + msg;
    } else {
      btnSos.style.display = 'none';
    }
  }

  // Cargar salas y sedes
  setupRoomsAndVenues();

  // Cargar días
  renderDaysSelector();

  // Renderizar filtros de sedes y salas
  renderVenueButtons();
  renderQuickTechButtons();
  renderRoomCheckboxes();

  // Actualizar badges
  updateGlobalNotesBadge();
  updateBadges();

  // Renderizar contenido
  renderSchedule();
}

// ORGANIZACIÓN DE SALAS Y SEDES
var allRoomsList = [];
var venuesMap = {};

function setupRoomsAndVenues() {
  var schedule = eventData.schedule || { rooms: [], days: [] };
  var rawRooms = schedule.rooms || [];

  // También recopilar salas de las sesiones por si no estuvieran en schedule.rooms
  var foundRooms = new Set();
  (schedule.days || []).forEach(function(d) {
    (d.sessions || []).forEach(function(s) {
      if (s.room) foundRooms.add(s.room.trim());
    });
  });
  rawRooms.forEach(function(r) { foundRooms.add(r.trim()); });

  allRoomsList = Array.from(foundRooms);
  if (allRoomsList.length === 0) {
    allRoomsList = ['Auditorio Principal', 'Sala A', 'Sala B'];
  }

  // Categorizar salas por sede o tipología automáticamente
  venuesMap = {
    'all': { name: 'Todas', rooms: [...allRoomsList] }
  };

  allRoomsList.forEach(function(room) {
    var lower = room.toLowerCase();
    var venueKey = 'sede_principal';
    var venueName = 'Palacio / Principal';

    if (lower.includes('hotel')) {
      venueKey = 'hotel';
      venueName = 'Hotel';
    } else if (lower.includes('poster') || lower.includes('póster') || lower.includes('exhibit')) {
      venueKey = 'posters';
      venueName = 'e-Póster / Zona Exposición';
    } else if (lower.includes('auditorio') || lower.includes('plenaria')) {
      venueKey = 'auditorio';
      venueName = 'Auditorios';
    } else if (lower.includes('taller') || lower.includes('workshop')) {
      venueKey = 'talleres';
      venueName = 'Talleres';
    }

    if (!venuesMap[venueKey]) {
      venuesMap[venueKey] = { name: venueName, rooms: [] };
    }
    venuesMap[venueKey].rooms.push(room);
  });

  // Cargar salas seleccionadas previas
  var savedRooms = safeGet('event_selected_rooms_v1', null);
  if (savedRooms && Array.isArray(savedRooms) && savedRooms.length > 0) {
    selectedRooms = savedRooms;
  } else {
    // Por defecto todas seleccionadas
    selectedRooms = [...allRoomsList];
  }
}

// RENDERIZADO DEL SELECTOR DE DÍAS (BOTONES GRANDES TIPO SEMERGEN)
function renderDaysSelector() {
  var grid = document.getElementById('days-selector-grid');
  if (!grid) return;

  var days = (eventData.schedule && eventData.schedule.days) || [];
  if (days.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-xs text-slate-400">Sin jornadas definidas</div>';
    return;
  }

  var html = '';
  days.forEach(function(d, idx) {
    var isSelected = (selectedDayIdx === idx);
    var label = d.label || d.date || ('Día ' + (idx + 1));
    var sessionCount = (d.sessions || []).length;

    html += '<button onclick="selectDayByIndex(' + idx + ')" ' +
      'class="p-2 sm:p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center active:scale-95 ' +
      (isSelected 
        ? 'bg-teal-800 text-white border-teal-800 shadow-md ring-2 ring-teal-500/40 font-bold' 
        : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300') + '">' +
      '<span class="text-xs font-black ' + (isSelected ? 'text-amber-300' : 'text-teal-900') + '">' +
        escapeHtml(label) +
      '</span>' +
      '<span class="text-[10px] ' + (isSelected ? 'text-teal-100' : 'text-slate-500') + ' mt-0.5 font-medium">' +
        sessionCount + ' sesiones' +
      '</span>' +
    '</button>';
  });

  grid.innerHTML = html;
}

function selectDayByIndex(idx) {
  selectedDayIdx = idx;
  renderDaysSelector();
  renderSchedule();
}

// BOTONES DE SEDES
function renderVenueButtons() {
  var container = document.getElementById('venues-buttons-container');
  if (!container) return;

  var keys = Object.keys(venuesMap);
  var html = '';

  keys.forEach(function(key) {
    var v = venuesMap[key];
    var isActive = (currentVenue === key);
    var count = v.rooms.length;

    html += '<button onclick="filterByVenue(\'' + key + '\')" ' +
      'class="px-2 py-0.5 rounded-lg font-bold transition cursor-pointer text-[11px] ' +
      (isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-teal-800 hover:bg-white/70') + '">' +
      escapeHtml(v.name) + ' (' + count + ')' +
    '</button>';
  });

  html += '<button onclick="selectAllRooms(false)" class="px-1.5 py-0.5 rounded-lg font-medium text-rose-600 hover:underline cursor-pointer ml-1 text-[11px]">Limpiar</button>';

  container.innerHTML = html;
}

function filterByVenue(venueKey) {
  currentVenue = venueKey;
  if (venueKey === 'all') {
    selectedRooms = [...allRoomsList];
  } else if (venuesMap[venueKey]) {
    selectedRooms = [...venuesMap[venueKey].rooms];
  }
  safeSet('event_selected_rooms_v1', selectedRooms);
  renderVenueButtons();
  renderQuickTechButtons();
  renderRoomCheckboxes();
  renderSchedule();
}

// BOTONES RÁPIDOS "SOLO MI SALA" (1 CLIC)
function renderQuickTechButtons() {
  var container = document.getElementById('quick-tech-buttons');
  if (!container) return;

  var html = '<div class="flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scrollbar p-0.5">';

  allRoomsList.forEach(function(room) {
    var isOnlyThis = (selectedRooms.length === 1 && selectedRooms[0] === room);

    html += '<button onclick="selectSingleRoom(\'' + escapeJsString(room) + '\')" ' +
      'class="px-2 py-1 rounded-lg text-[10.5px] font-bold border transition active:scale-95 cursor-pointer ' +
      (isOnlyThis 
        ? 'bg-teal-800 text-white border-teal-900 ring-2 ring-teal-400 shadow-sm' 
        : 'bg-white text-slate-800 border-slate-200 hover:bg-teal-50') + '">' +
      '<i class="fa-solid fa-door-closed mr-1 ' + (isOnlyThis ? 'text-amber-300' : 'text-teal-600') + '"></i>' +
      escapeHtml(room) +
    '</button>';
  });

  html += '</div>';
  container.innerHTML = html;
}

function selectSingleRoom(roomName) {
  selectedRooms = [roomName];
  safeSet('event_selected_rooms_v1', selectedRooms);
  renderQuickTechButtons();
  renderRoomCheckboxes();
  updateBadges();
  renderSchedule();
  showToast('Modo exclusivo: ' + roomName, 'fa-door-open text-teal-400');
}

function selectAllRooms(state) {
  selectedRooms = state ? [...allRoomsList] : [];
  safeSet('event_selected_rooms_v1', selectedRooms);
  renderQuickTechButtons();
  renderRoomCheckboxes();
  updateBadges();
  renderSchedule();
}

function renderRoomCheckboxes() {
  var container = document.getElementById('rooms-grid');
  if (!container) return;

  var html = '';
  allRoomsList.forEach(function(room) {
    var isChecked = selectedRooms.includes(room);

    html += '<label class="flex items-center gap-1.5 p-1 rounded-lg border text-xs cursor-pointer select-none transition ' +
      (isChecked ? 'bg-teal-50 border-teal-300 text-teal-950 font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50') + '">' +
      '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="toggleRoomCheckbox(\'' + escapeJsString(room) + '\', this.checked)" class="rounded w-3.5 h-3.5 text-teal-600 focus:ring-teal-500">' +
      '<span class="truncate text-[10.5px] leading-tight" title="' + escapeHtml(room) + '">' +
        escapeHtml(room) +
      '</span>' +
    '</label>';
  });

  container.innerHTML = html;
}

function toggleRoomCheckbox(room, isChecked) {
  if (isChecked) {
    if (!selectedRooms.includes(room)) selectedRooms.push(room);
  } else {
    selectedRooms = selectedRooms.filter(function(r) { return r !== room; });
  }
  safeSet('event_selected_rooms_v1', selectedRooms);
  renderQuickTechButtons();
  updateBadges();
  renderSchedule();
}

function updateBadges() {
  var b = document.getElementById('selected-rooms-badge');
  var mobB = document.getElementById('mobile-filter-badge');
  var mobNavB = document.getElementById('mobile-nav-badge');
  var txt = selectedRooms.length + ' de ' + allRoomsList.length + ' salas';
  if (b) b.textContent = txt;
  if (mobB) mobB.textContent = selectedRooms.length;
  if (mobNavB) mobNavB.textContent = selectedRooms.length;
}

function filterBySearch() {
  var input = document.getElementById('session-search-input');
  if (input) {
    currentSearchTerm = input.value.toLowerCase().trim();
    renderSchedule();
  }
}

// TOGGLE VISTAS Y OPCIONES
var currentViewMode = 'list'; // 'list' (tarjetas) | 'grid' (parrilla)

function setViewMode(mode) {
  currentViewMode = mode;
  var btnList = document.getElementById('btn-view-list');
  var btnGrid = document.getElementById('btn-view-grid');
  if (btnList && btnGrid) {
    if (mode === 'list') {
      btnList.className = 'px-2.5 py-1 rounded-md font-bold transition bg-white shadow-sm text-slate-800 cursor-pointer';
      btnGrid.className = 'px-2.5 py-1 rounded-md font-bold transition text-slate-600 hover:text-slate-900 cursor-pointer';
    } else {
      btnGrid.className = 'px-2.5 py-1 rounded-md font-bold transition bg-white shadow-sm text-slate-800 cursor-pointer';
      btnList.className = 'px-2.5 py-1 rounded-md font-bold transition text-slate-600 hover:text-slate-900 cursor-pointer';
    }
  }
  renderSchedule();
}

function toggleCompactMode() {
  isCompactView = !isCompactView;
  safeSet('event_compact_view_v1', isCompactView);
  var btnTxt = document.getElementById('txt-compact');
  var btnIcon = document.getElementById('icon-compact');
  var mobLabel = document.getElementById('mobile-compact-label');
  if (btnTxt) btnTxt.textContent = isCompactView ? 'Modo Compacto' : 'Vista Detallada';
  if (btnIcon) btnIcon.className = isCompactView ? 'fa-solid fa-compress text-amber-600' : 'fa-solid fa-expand text-slate-600';
  if (mobLabel) mobLabel.textContent = isCompactView ? 'Compacto' : 'Detallada';
  renderSchedule();
}

function toggleAllSpeakers() {
  globalShowSpeakers = !globalShowSpeakers;
  visibleSpeakersMap = {};
  var txt = document.getElementById('txt-toggle-speakers');
  if (txt) txt.textContent = globalShowSpeakers ? 'Ocultar Ponentes' : 'Ver Ponentes';
  renderSchedule();
}

function toggleSessionSpeakers(sessionId) {
  visibleSpeakersMap[sessionId] = !visibleSpeakersMap[sessionId];
  renderSchedule();
}

function toggleMobileDrawer() {
  var drawer = document.getElementById('filter-drawer');
  if (drawer) drawer.classList.toggle('hidden');
}

// CLASIFICACIÓN DE BADGE POR TIPO
function getTypeBadgeClass(title, type) {
  var text = ((type || '') + ' ' + (title || '')).toLowerCase();
  if (text.includes('mesa') || text.includes('round table')) return 'badge-mesa';
  if (text.includes('taller') || text.includes('workshop')) return 'badge-taller';
  if (text.includes('keynote') || text.includes('inaugural') || text.includes('clausura') || text.includes('plenaria')) return 'badge-keynote';
  if (text.includes('simposio') || text.includes('symposium')) return 'badge-simposio';
  if (text.includes('conferencia') || text.includes('lecture')) return 'badge-conferencia';
  if (text.includes('oral') || text.includes('comunicación')) return 'badge-oral';
  if (text.includes('poster') || text.includes('póster')) return 'badge-poster';
  return 'badge-default';
}

function getTypeBadgeLabel(title, type) {
  if (type) return type;
  var text = (title || '').toLowerCase();
  if (text.includes('mesa') || text.includes('round table')) return 'Mesa Redonda';
  if (text.includes('taller') || text.includes('workshop')) return 'Taller / Workshop';
  if (text.includes('keynote') || text.includes('plenaria')) return 'Keynote / Plenaria';
  if (text.includes('simposio') || text.includes('symposium')) return 'Simposio';
  if (text.includes('conferencia')) return 'Conferencia';
  if (text.includes('oral')) return 'Com. Oral';
  if (text.includes('poster') || text.includes('póster')) return 'Póster';
  return 'Sesión';
}

// RENDERIZADO PRINCIPAL (TARJETAS DE SESIONES AGRUPADAS POR HORARIO)
function renderSchedule() {
  var output = document.getElementById('schedule-output');
  if (!output) return;

  var days = (eventData.schedule && eventData.schedule.days) || [];
  var currentDay = days[selectedDayIdx];

  if (!currentDay) {
    output.innerHTML = '<div class="text-center py-12 text-slate-400">No hay sesiones para este día.</div>';
    return;
  }

  var rawSessions = currentDay.sessions || [];

  // Filtrado por salas seleccionadas y búsqueda
  var filtered = rawSessions.filter(function(s) {
    var roomName = (s.room || '').trim();
    if (selectedRooms.length > 0 && !selectedRooms.includes(roomName)) {
      return false;
    }

    if (currentSearchTerm) {
      var matchTitle = (s.title || '').toLowerCase().includes(currentSearchTerm);
      var matchRoom = roomName.toLowerCase().includes(currentSearchTerm);
      var matchMods = (s.moderators || []).join(' ').toLowerCase().includes(currentSearchTerm);
      var matchTalks = (s.sub_talks || []).some(function(t) {
        return (t.title || '').toLowerCase().includes(currentSearchTerm) ||
               (t.speaker || '').toLowerCase().includes(currentSearchTerm);
      });
      if (!matchTitle && !matchRoom && !matchMods && !matchTalks) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    output.innerHTML = '<div class="text-center py-12 px-4">' +
      '<i class="fa-solid fa-calendar-xmark text-4xl text-slate-300 mb-3 block"></i>' +
      '<h3 class="text-base font-bold text-slate-700">No hay sesiones para mostrar con estos filtros</h3>' +
      '<p class="text-xs text-slate-500 mt-1">Prueba a seleccionar más salas o borrar el término de búsqueda.</p>' +
      '<div class="mt-4 flex flex-wrap justify-center gap-2">' +
        '<button onclick="selectAllRooms(true)" class="bg-teal-800 text-white text-xs font-bold px-4 py-2 rounded-xl shadow active:scale-95 cursor-pointer">' +
          'Mostrar Todas las Salas (' + allRoomsList.length + ')' +
        '</button>' +
        (currentSearchTerm ? '<button onclick="document.getElementById(\'session-search-input\').value=\'\'; filterBySearch();" class="bg-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl active:scale-95 cursor-pointer">Limpiar Búsqueda</button>' : '') +
      '</div>' +
    '</div>';
    return;
  }

  if (currentViewMode === 'list') {
    renderCardListView(output, filtered, currentDay);
  } else {
    renderGridView(output, filtered, currentDay);
  }

  evaluateLiveSessions();
}

// VISTA HORARIA CON TARJETAS
function renderCardListView(output, sessions, currentDay) {
  // Agrupar por franja horaria
  var groupedByTime = {};
  var timesList = [];

  sessions.forEach(function(s) {
    var timeSlot = (s.time_start || '00:00') + ' - ' + (s.time_end || '00:00');
    if (!groupedByTime[timeSlot]) {
      groupedByTime[timeSlot] = [];
      timesList.push(timeSlot);
    }
    groupedByTime[timeSlot].push(s);
  });

  timesList.sort();

  var html = '<div class="mb-3 pb-2 border-b border-slate-200 flex justify-between items-center">' +
    '<div>' +
      '<h2 class="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">' +
        '<span>' + escapeHtml(currentDay.label || currentDay.date || 'Jornada') + '</span>' +
        (selectedRooms.length === 1 ? '<span class="text-[9px] font-black text-teal-900 bg-teal-100 border border-teal-300 px-2 py-0.5 rounded uppercase">Vista Exclusiva Técnico (' + escapeHtml(selectedRooms[0]) + ')</span>' : '') +
      '</h2>' +
      '<p class="text-[10px] text-slate-500 font-medium">' + sessions.length + ' sesiones en ' + selectedRooms.length + ' sala(s) activa(s)</p>' +
    '</div>' +
  '</div>' +
  '<div class="space-y-4">';

  timesList.forEach(function(timeSlot) {
    var slotSessions = groupedByTime[timeSlot];
    var finishedCount = slotSessions.filter(function(s) { return isSessionFinished(s.id); }).length;
    var allFinished = (slotSessions.length > 0 && finishedCount === slotSessions.length);

    html += '<div class="print-card bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 sm:p-3">' +
      '<div class="flex items-center gap-1.5 text-teal-950 font-black text-xs mb-2 pb-1.5 border-b border-slate-200 flex-wrap">' +
        '<i class="fa-regular fa-clock text-teal-600"></i>' +
        '<span>' + timeSlot + ' hs</span>' +
        '<span class="text-[10px] text-slate-500 font-semibold">(' + slotSessions.length + ' ' + (slotSessions.length === 1 ? 'sesión' : 'sesiones simultáneas') + ')</span>' +
        '<div class="ml-auto flex items-center gap-1.5">' +
          '<span class="text-[9px] font-extrabold px-2 py-0.5 rounded-full ' + 
            (allFinished ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : (finishedCount > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-200 text-slate-600')) + '">' +
            finishedCount + '/' + slotSessions.length + ' terminadas' +
          '</span>' +
          '<button onclick="toggleSlotFinished(\'' + escapeJsString(timeSlot) + '\', ' + (!allFinished) + ')" class="text-[9px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer ' +
            (allFinished ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100' : 'bg-teal-700 text-white border-teal-700 hover:bg-teal-800 shadow-sm') + '">' +
            '<i class="fa-solid ' + (allFinished ? 'fa-rotate-left mr-1 text-slate-500' : 'fa-check mr-1 text-amber-300') + '"></i>' +
            (allFinished ? 'Reabrir franja' : 'Finalizar franja') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">';

    slotSessions.forEach(function(s) {
      var badgeClass = getTypeBadgeClass(s.title, s.type);
      var badgeLabel = getTypeBadgeLabel(s.title, s.type);
      var isFinished = isSessionFinished(s.id);
      var noteObj = getSessionNote(s.id);
      var hasNote = !!(noteObj && noteObj.text && noteObj.text.trim());
      var isSpeakerVisible = visibleSpeakersMap[s.id] !== undefined ? visibleSpeakersMap[s.id] : globalShowSpeakers;
      var subtalks = s.sub_talks || [];

      html += '<div id="session-card-' + s.id + '" class="p-3 rounded-xl border transition flex flex-col justify-between ' + 
        (isFinished ? 'bg-emerald-50/40 border-emerald-300 shadow-sm' : 'bg-white border-slate-200 shadow-sm') + '">' +
        '<div>' +
          '<div class="flex items-center justify-between gap-1 mb-1.5 flex-wrap">' +
            '<div class="flex items-center gap-1 flex-wrap">' +
              '<span class="text-[9px] font-black px-1.5 py-0.5 rounded uppercase ' + badgeClass + '">' +
                escapeHtml(badgeLabel) +
              '</span>' +
              (isFinished ? '<span class="text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase bg-emerald-600 text-white shadow-sm flex items-center gap-0.5"><i class="fa-solid fa-check"></i>Terminada</span>' : '') +
              '<span id="live-tag-' + s.id + '" class="text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase hidden bg-rose-600 text-white animate-pulse">EN VIVO</span>' +
            '</div>' +
            '<button onclick="selectSingleRoom(\'' + escapeJsString(s.room || 'Sala') + '\')" title="Clic para filtrar solo esta sala" class="text-[10px] font-black truncate max-w-[150px] text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-1.5 py-0.5 rounded cursor-pointer transition">' +
              '<i class="fa-solid fa-location-dot text-teal-600 mr-0.5"></i>' + escapeHtml(s.room || 'Sala') +
            '</button>' +
          '</div>' +
          '<h3 class="font-extrabold text-slate-900 text-xs leading-snug mb-1 ' + (isCompactView ? 'line-clamp-2' : '') + '">' +
            escapeHtml(s.title) +
          '</h3>' +
          (!isCompactView && s.details ? '<p class="text-[10px] text-slate-500 mt-1 leading-normal">' + escapeHtml(s.details) + '</p>' : '') +
          
          // Nota técnica incrustada si existe
          (hasNote ? 
            '<div onclick="openSessionNoteModal(\'' + s.id + '\')" class="mt-1.5 p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-[10px] cursor-pointer hover:bg-amber-100 transition shadow-sm" title="Clic para ver o editar la nota">' +
              '<div class="flex items-center justify-between text-[9px] font-bold text-amber-800 mb-0.5">' +
                '<span><i class="fa-solid fa-note-sticky text-amber-600 mr-1"></i>Nota Técnica:</span>' +
                '<span class="text-[8px] text-amber-600 font-normal">' + (noteObj.updatedAt || '') + '</span>' +
              '</div>' +
              '<p class="line-clamp-2 text-slate-800 font-medium">' + escapeHtml(noteObj.text) + '</p>' +
            '</div>' : '') +
        '</div>' +

        // Sub-ponencias / Detalles
        (!isCompactView && subtalks.length > 0 ?
          '<div class="mt-2 pt-2 border-t border-slate-100 space-y-1.5">' +
            '<div class="text-[9px] font-black uppercase text-teal-900 flex items-center justify-between">' +
              '<span>' + subtalks.length + ' Ponencias:</span>' +
            '</div>' +
            subtalks.slice(0, 3).map(function(talk) {
              return '<div class="text-[10px] text-slate-700 bg-slate-50 p-1 rounded border border-slate-100">' +
                '<div class="font-bold truncate">' + escapeHtml(talk.title) + '</div>' +
                (talk.speaker ? '<div class="text-[9px] text-slate-500"><i class="fa-solid fa-user-tie mr-0.5"></i>' + escapeHtml(talk.speaker) + '</div>' : '') +
              '</div>';
            }).join('') +
            (subtalks.length > 3 ? '<div class="text-[9px] text-slate-400 text-center">+' + (subtalks.length - 3) + ' ponencias más</div>' : '') +
          '</div>' : '') +

        // Barra inferior de la tarjeta (Ponentes + Nota + Terminar)
        '<div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 flex-wrap gap-1">' +
          '<div>' +
            ((s.speakers || (s.moderators && s.moderators.length)) ? 
              '<button onclick="toggleSessionSpeakers(\'' + s.id + '\')" class="text-teal-700 font-extrabold underline cursor-pointer p-0.5 hover:text-teal-900">' +
                (isSpeakerVisible ? 'Ocultar Ponentes' : 'Ver Ponentes') +
              '</button>' : '<span class="text-[9px] text-slate-400 font-medium">Sin ponentes</span>') +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            '<button onclick="openSessionNoteModal(\'' + s.id + '\')" title="Ver / Añadir nota técnica" class="cursor-pointer px-2 py-0.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ' + 
              (hasNote ? 'bg-amber-100 text-amber-950 border border-amber-400 shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-amber-50 hover:text-amber-900 border border-slate-200') + '">' +
              '<i class="fa-solid fa-note-sticky ' + (hasNote ? 'text-amber-600' : 'text-slate-400') + '"></i>' +
              '<span>Nota</span>' +
            '</button>' +
            '<button onclick="toggleSessionFinished(\'' + s.id + '\')" title="Marcar / desmarcar como terminada" class="cursor-pointer px-2 py-0.5 rounded-lg text-[10px] font-black transition flex items-center gap-1 ' + 
              (isFinished ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 border border-slate-200') + '">' +
              '<i class="fa-solid ' + (isFinished ? 'fa-check' : 'fa-check text-slate-400') + '"></i>' +
              '<span>' + (isFinished ? 'Terminada' : 'Terminar') + '</span>' +
            '</button>' +
          '</div>' +
        '</div>' +

        // Bloque desplegable de ponentes
        '<div class="' + (isSpeakerVisible ? 'block' : 'hidden') + ' mt-1.5 p-1.5 rounded bg-teal-50/70 border border-teal-100 text-[10px] text-slate-800 space-y-1">' +
          (s.moderators && s.moderators.length ? '<div><strong class="text-teal-900">Mod:</strong> ' + escapeHtml(s.moderators.join(', ')) + '</div>' : '') +
          (s.speakers ? '<div><strong class="text-teal-900">Pon:</strong> ' + escapeHtml(s.speakers) + '</div>' : '') +
        '</div>' +

      '</div>';
    });

    html += '</div></div>';
  });

  html += '</div>';
  output.innerHTML = html;
}

// VISTA PARRILLA (TABLA RESUMEN)
function renderGridView(output, sessions, currentDay) {
  var html = '<div class="overflow-x-auto ios-touch-scroll">' +
    '<table class="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">' +
      '<thead class="bg-teal-900 text-white">' +
        '<tr>' +
          '<th class="p-2.5 font-bold">Horario</th>' +
          '<th class="p-2.5 font-bold">Sala</th>' +
          '<th class="p-2.5 font-bold">Sesión</th>' +
          '<th class="p-2.5 font-bold">Moderadores / Ponentes</th>' +
          '<th class="p-2.5 font-bold text-center">Estado</th>' +
          '<th class="p-2.5 font-bold text-center">Acciones</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody class="divide-y divide-slate-200">';

  sessions.forEach(function(s) {
    var isFinished = isSessionFinished(s.id);
    var hasNote = !!(sessionNotesMap[s.id] && sessionNotesMap[s.id].text);

    html += '<tr class="' + (isFinished ? 'bg-emerald-50/50' : 'hover:bg-slate-50') + '">' +
      '<td class="p-2.5 font-bold font-mono text-teal-950 whitespace-nowrap">' + s.time_start + ' - ' + s.time_end + '</td>' +
      '<td class="p-2.5 font-bold text-slate-700 whitespace-nowrap">' + escapeHtml(s.room) + '</td>' +
      '<td class="p-2.5">' +
        '<div class="font-bold text-slate-900">' + escapeHtml(s.title) + '</div>' +
        (s.type ? '<span class="text-[9px] font-black uppercase text-teal-700 bg-teal-50 px-1 py-0.2 rounded border border-teal-200">' + escapeHtml(s.type) + '</span>' : '') +
      '</td>' +
      '<td class="p-2.5 text-[11px] text-slate-600">' +
        (s.moderators && s.moderators.length ? '<div><strong>Mod:</strong> ' + escapeHtml(s.moderators.join(', ')) + '</div>' : '') +
        (s.speakers ? '<div><strong>Pon:</strong> ' + escapeHtml(s.speakers) + '</div>' : '') +
      '</td>' +
      '<td class="p-2.5 text-center">' +
        (isFinished ? '<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">Terminada</span>' : '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Pendiente</span>') +
      '</td>' +
      '<td class="p-2.5 text-center whitespace-nowrap">' +
        '<button onclick="openSessionNoteModal(\'' + s.id + '\')" class="p-1 text-slate-600 hover:text-amber-600 cursor-pointer mr-1" title="Notas">' +
          '<i class="fa-solid fa-note-sticky ' + (hasNote ? 'text-amber-500' : '') + '"></i>' +
        '</button>' +
        '<button onclick="toggleSessionFinished(\'' + s.id + '\')" class="p-1 text-slate-600 hover:text-emerald-600 cursor-pointer" title="Terminar">' +
          '<i class="fa-solid ' + (isFinished ? 'fa-circle-check text-emerald-600' : 'fa-check') + '"></i>' +
        '</button>' +
      '</td>' +
    '</tr>';
  });

  html += '</tbody></table></div>';
  output.innerHTML = html;
}

// EVALUACIÓN DE SESIÓN EN VIVO / PRÓXIMA
function evaluateLiveSessions() {
  if (!eventData || !eventData.schedule) return;
  var now = new Date();
  var curMin = now.getHours() * 60 + now.getMinutes();

  var days = eventData.schedule.days || [];
  var currentDay = days[selectedDayIdx];
  if (!currentDay) return;

  (currentDay.sessions || []).forEach(function(s) {
    var card = document.getElementById('session-card-' + s.id);
    var tag = document.getElementById('live-tag-' + s.id);
    if (!card) return;

    var start = timeToMinutes(s.time_start);
    var end = timeToMinutes(s.time_end);

    card.classList.remove('session-is-live', 'session-is-next');
    if (tag) tag.classList.add('hidden');

    if (curMin >= start && curMin < end) {
      card.classList.add('session-is-live');
      if (tag) {
        tag.textContent = 'EN VIVO AHORA';
        tag.classList.remove('hidden');
      }
    } else if (curMin < start && (start - curMin) <= 15) {
      card.classList.add('session-is-next');
      if (tag) {
        tag.textContent = 'PRÓXIMA (-' + (start - curMin) + 'm)';
        tag.className = 'text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase bg-amber-500 text-slate-950 shadow-sm';
        tag.classList.remove('hidden');
      }
    }
  });
}

function timeToMinutes(t) {
  if (!t) return 0;
  var parts = t.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

// CONTROL DE ESTADO DE SESIÓN (TERMINADA / PENDIENTE)
function isSessionFinished(id) {
  return !!finishedSessionsMap[id];
}

function toggleSessionFinished(id, e) {
  if (e) e.stopPropagation();
  if (finishedSessionsMap[id]) {
    delete finishedSessionsMap[id];
    showToast('Sesión desmarcada como terminada', 'fa-rotate-left text-amber-400');
  } else {
    var now = new Date();
    var tStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    finishedSessionsMap[id] = { finished: true, timestamp: tStr };
    showToast('Sesión marcada como terminada (' + tStr + ' hs)', 'fa-circle-check text-emerald-400');
  }
  safeSet('event_finished_sessions_v1', finishedSessionsMap);
  renderSchedule();
}

function toggleSlotFinished(timeSlot, targetState) {
  var count = 0;
  var now = new Date();
  var tStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  var days = (eventData.schedule && eventData.schedule.days) || [];
  var currentDay = days[selectedDayIdx];
  if (!currentDay) return;

  (currentDay.sessions || []).forEach(function(s) {
    var slot = (s.time_start || '00:00') + ' - ' + (s.time_end || '00:00');
    if (slot === timeSlot && (selectedRooms.length === 0 || selectedRooms.includes((s.room || '').trim()))) {
      if (targetState) {
        finishedSessionsMap[s.id] = { finished: true, timestamp: tStr };
      } else {
        delete finishedSessionsMap[s.id];
      }
      count++;
    }
  });

  safeSet('event_finished_sessions_v1', finishedSessionsMap);
  showToast(targetState ? (count + ' sesiones marcadas como terminadas') : ('Franja ' + timeSlot + ' hs reabierta'), targetState ? 'fa-circle-check text-emerald-400' : 'fa-rotate-left text-amber-400');
  renderSchedule();
}

// MODAL DE NOTAS E INCIDENCIAS POR SESIÓN
function getSessionNote(id) {
  return sessionNotesMap[id] || null;
}

function getSessionById(id) {
  var days = (eventData && eventData.schedule && eventData.schedule.days) || [];
  for (var d = 0; d < days.length; d++) {
    var sessions = days[d].sessions || [];
    for (var s = 0; s < sessions.length; s++) {
      if (sessions[s].id === id) return sessions[s];
    }
  }
  return null;
}

function openSessionNoteModal(id, e) {
  if (e) e.stopPropagation();
  var session = getSessionById(id);
  if (!session) return;
  currentEditingSessionId = id;

  var elRoom = document.getElementById('modal-session-room');
  var elTime = document.getElementById('modal-session-time');
  var elTitle = document.getElementById('modal-session-title');
  var elSpeakers = document.getElementById('modal-session-speakers');
  var elBadges = document.getElementById('modal-session-badges');
  var elTextarea = document.getElementById('modal-note-textarea');
  var elTimeInfo = document.getElementById('modal-note-time-info');
  var btnDelete = document.getElementById('modal-delete-note-btn');

  if (elRoom) elRoom.textContent = session.room || 'Sala';
  if (elTime) elTime.textContent = (session.time_start || '') + ' - ' + (session.time_end || '') + ' hs';
  if (elTitle) elTitle.textContent = session.title || '';
  if (elSpeakers) {
    var spkText = session.speakers ? ('Ponentes: ' + session.speakers) : '';
    if (session.moderators && session.moderators.length) {
      spkText = (spkText ? spkText + ' | ' : '') + 'Moderadores: ' + session.moderators.join(', ');
    }
    elSpeakers.textContent = spkText;
  }

  if (elBadges) {
    var badgeClass = getTypeBadgeClass(session.title, session.type);
    var badgeLabel = getTypeBadgeLabel(session.title, session.type);
    elBadges.innerHTML = '<span class="text-[9px] font-black px-1.5 py-0.5 rounded uppercase ' + badgeClass + '">' + escapeHtml(badgeLabel) + '</span>' +
      '<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase bg-teal-100 text-teal-900 border border-teal-200">' + escapeHtml(session.room || 'Sala') + '</span>';
  }

  var noteObj = getSessionNote(id);
  if (elTextarea) elTextarea.value = noteObj ? noteObj.text : '';
  if (elTimeInfo) elTimeInfo.textContent = noteObj && noteObj.updatedAt ? ('Última modificación: ' + noteObj.updatedAt) : '';

  if (btnDelete) {
    if (noteObj && noteObj.text) btnDelete.classList.remove('hidden');
    else btnDelete.classList.add('hidden');
  }

  updateModalStatusButton(isSessionFinished(id));

  var modal = document.getElementById('session-note-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeSessionNoteModal() {
  var modal = document.getElementById('session-note-modal');
  if (modal) modal.classList.add('hidden');
  currentEditingSessionId = null;
}

function updateModalStatusButton(isFinished) {
  var btn = document.getElementById('modal-toggle-status-btn');
  var txt = document.getElementById('modal-session-status-text');
  if (!btn || !txt) return;

  if (isFinished) {
    txt.innerHTML = '<span class="text-emerald-700 font-black flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Terminada</span>';
    btn.className = 'px-3 py-1.5 rounded-xl font-bold text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700';
    btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>✓ Sesión Terminada (Reabrir)</span>';
  } else {
    txt.innerHTML = '<span class="text-amber-700 font-bold flex items-center gap-1"><i class="fa-solid fa-clock"></i> Pendiente / En curso</span>';
    btn.className = 'px-3 py-1.5 rounded-xl font-bold text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer bg-slate-200 text-slate-800 hover:bg-slate-300';
    btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Marcar como Terminada</span>';
  }
}

function toggleModalSessionStatus() {
  if (!currentEditingSessionId) return;
  var isFinished = isSessionFinished(currentEditingSessionId);
  if (isFinished) {
    delete finishedSessionsMap[currentEditingSessionId];
    updateModalStatusButton(false);
    showToast('Sesión marcada como pendiente', 'fa-rotate-left text-amber-400');
  } else {
    var now = new Date();
    var tStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    finishedSessionsMap[currentEditingSessionId] = { finished: true, timestamp: tStr };
    updateModalStatusButton(true);
    showToast('Sesión marcada como terminada', 'fa-circle-check text-emerald-400');
  }
  safeSet('event_finished_sessions_v1', finishedSessionsMap);
  renderSchedule();
}

function saveSessionNote() {
  if (!currentEditingSessionId) return;
  var elTextarea = document.getElementById('modal-note-textarea');
  var text = elTextarea ? elTextarea.value.trim() : '';
  var now = new Date();
  var dateStr = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth()+1).padStart(2, '0') + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  if (text) {
    sessionNotesMap[currentEditingSessionId] = {
      text: text,
      updatedAt: dateStr
    };
    showToast('Nota técnica guardada correctamente', 'fa-floppy-disk text-teal-400');
  } else {
    delete sessionNotesMap[currentEditingSessionId];
    showToast('Nota vacía eliminada', 'fa-trash text-slate-400');
  }
  safeSet('event_session_notes_v1', sessionNotesMap);
  updateGlobalNotesBadge();
  closeSessionNoteModal();
  renderSchedule();
}

function deleteSessionNote() {
  if (!currentEditingSessionId) return;
  if (confirm('¿Deseas eliminar la nota técnica de esta sesión?')) {
    delete sessionNotesMap[currentEditingSessionId];
    safeSet('event_session_notes_v1', sessionNotesMap);
    updateGlobalNotesBadge();
    showToast('Nota técnica eliminada', 'fa-trash text-rose-400');
    closeSessionNoteModal();
    renderSchedule();
  }
}

// PANEL GENERAL DE NOTAS TÉCNICAS
function updateGlobalNotesBadge() {
  var count = Object.keys(sessionNotesMap).length;
  var badge = document.getElementById('global-notes-count-badge');
  var mobBadge = document.getElementById('mobile-nav-notes-badge');
  if (badge) {
    badge.textContent = count;
    badge.className = count > 0 
      ? 'bg-amber-400 text-slate-900 text-[10px] px-1.5 py-0.2 rounded-full font-black animate-pulse' 
      : 'bg-teal-800 text-teal-200 text-[10px] px-1.5 py-0.2 rounded-full font-black';
  }
  if (mobBadge) {
    mobBadge.textContent = count;
    if (count > 0) mobBadge.classList.remove('hidden');
    else mobBadge.classList.add('hidden');
  }
}

function openGlobalNotesModal() {
  var modal = document.getElementById('global-notes-modal');
  var listEl = document.getElementById('global-notes-list');
  var summaryEl = document.getElementById('global-notes-summary-text');
  if (!modal || !listEl) return;

  var keys = Object.keys(sessionNotesMap);
  if (summaryEl) summaryEl.textContent = keys.length + (keys.length === 1 ? ' nota técnica registrada' : ' notas técnicas registradas');

  if (keys.length === 0) {
    listEl.innerHTML = '<div class="text-center py-8 text-slate-400">' +
      '<i class="fa-regular fa-note-sticky text-3xl mb-2 text-slate-300 block"></i>' +
      '<p class="text-xs font-bold text-slate-600">No hay notas registradas todavía</p>' +
      '<p class="text-[10px] text-slate-400 mt-1">Haz clic en el botón "Nota" de cualquier sesión para registrar observaciones o incidencias.</p>' +
    '</div>';
  } else {
    var html = '';
    keys.forEach(function(sId) {
      var note = sessionNotesMap[sId];
      var sObj = getSessionById(sId);
      if (!sObj) return;
      var isFin = isSessionFinished(sId);

      html += '<div class="p-3 rounded-xl border border-slate-200 bg-white hover:border-teal-300 transition shadow-sm space-y-1.5">' +
        '<div class="flex items-center justify-between gap-1 flex-wrap">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-teal-50 text-teal-900 border border-teal-200">' + escapeHtml(sObj.room || 'Sala') + '</span>' +
            '<span class="text-[9px] text-slate-500 font-bold"><i class="fa-regular fa-clock mr-0.5"></i>' + sObj.time_start + ' - ' + sObj.time_end + ' hs</span>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            (isFin ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300"><i class="fa-solid fa-circle-check mr-0.5"></i>Terminada</span>' : '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">Pendiente</span>') +
            '<button onclick="closeGlobalNotesModal(); openSessionNoteModal(\'' + sId + '\')" class="text-teal-700 hover:text-teal-900 font-bold text-[10px] px-1.5 py-0.5 rounded hover:bg-slate-100 cursor-pointer">' +
              '<i class="fa-solid fa-pen-to-square"></i> Editar' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<h5 class="text-xs font-bold text-slate-900 leading-tight">' + escapeHtml(sObj.title) + '</h5>' +
        '<div class="bg-amber-50/70 border border-amber-200 p-2 rounded-lg text-slate-800 text-[11px] whitespace-pre-wrap font-sans">' +
          escapeHtml(note.text) +
        '</div>' +
        '<div class="text-[9px] text-slate-400 text-right">' + (note.updatedAt ? ('Registrada: ' + note.updatedAt) : '') + '</div>' +
      '</div>';
    });
    listEl.innerHTML = html;
  }

  modal.classList.remove('hidden');
}

function closeGlobalNotesModal() {
  var modal = document.getElementById('global-notes-modal');
  if (modal) modal.classList.add('hidden');
}

function exportNotesAsText() {
  var keys = Object.keys(sessionNotesMap);
  if (keys.length === 0) {
    alert('No hay notas para exportar.');
    return;
  }
  var report = '=== INFORME TÉCNICO DE INCIDENCIAS Y NOTAS ===\n\n';
  keys.forEach(function(sId) {
    var note = sessionNotesMap[sId];
    var sObj = getSessionById(sId);
    if (!sObj) return;
    report += 'Sala: ' + (sObj.room || '-') + ' | Horario: ' + sObj.time_start + ' - ' + sObj.time_end + ' hs\n';
    report += 'Sesión: ' + sObj.title + '\n';
    report += 'Estado: ' + (isSessionFinished(sId) ? 'TERMINADA' : 'PENDIENTE') + '\n';
    report += 'Fecha nota: ' + (note.updatedAt || '-') + '\n';
    report += 'Nota:\n' + note.text + '\n';
    report += '------------------------------------------------------------\n\n';
  });

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(report).then(function() {
      showToast('Informe técnico copiado al portapapeles', 'fa-copy text-teal-400');
    });
  } else {
    alert(report);
  }
}

function clearAllNotes() {
  if (confirm('¿Estás seguro de que deseas borrar TODAS las notas técnicas registradas? Esta acción no se puede deshacer.')) {
    sessionNotesMap = {};
    safeSet('event_session_notes_v1', sessionNotesMap);
    updateGlobalNotesBadge();
    openGlobalNotesModal();
    renderSchedule();
    showToast('Todas las notas han sido eliminadas', 'fa-trash text-rose-400');
  }
}

// TOAST NOTIFICATIONS
var _toastTimer = null;
function showToast(msg, iconClass) {
  var toast = document.getElementById('tech-toast');
  var txt = document.getElementById('tech-toast-text');
  var icon = document.getElementById('tech-toast-icon');
  if (!toast || !txt) return;

  txt.textContent = msg;
  if (icon && iconClass) icon.className = 'fa-solid ' + iconClass;

  toast.classList.remove('opacity-0', 'pointer-events-none');
  toast.classList.add('opacity-100');

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() {
    toast.classList.remove('opacity-100');
    toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2600);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function escapeJsString(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}
