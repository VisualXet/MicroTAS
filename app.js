/**
 * MicroTAS 2026 - Room Technician & Session Management Engine
 * Pure Vanilla JavaScript, zero dependencies, offline & Netlify ready
 */

(function () {
  'use strict';

  // State Management
  const state = {
    selectedDay: 'all', // 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'all'
    selectedRoom: 'all', // 'all', 'auditorium', 'manuel_de_falla', 'machuca_albeniz', 'workshops', 'other'
    searchQuery: '',
    viewMode: 'detailed', // 'detailed' | 'compact'
    theme: 'dark', // 'dark' | 'light'
    notesFilter: 'all', // 'all', 'with_notes', 'issues'
    expandedSpeakers: {}, // session_id: boolean
    technicianNotes: {}, // talk_id: { text: string, status: string, updatedAt: string }
    allSpeakersExpanded: false,
    hideStatus: false // Hide status picker and technician bar from talks
  };

  // LocalStorage Keys
  const STORAGE_KEYS = {
    THEME: 'microtas_theme',
    VIEW_MODE: 'microtas_view_mode',
    NOTES: 'microtas_tech_notes',
    EXPANDED_SPEAKERS: 'microtas_expanded_speakers',
    HIDE_STATUS: 'microtas_hide_status'
  };

  // DOM Elements cache
  let dom = {};

  // Initialize Application
  function init() {
    loadPersistentState();
    cacheDomElements();
    setupEventListeners();
    applyTheme();
    applyStatusVisibility();
    applyViewModeUI();
    renderDayCardsGrid();
    renderRoomsModal();
    updateActiveDayBanner();
    updateNotesBadges();
    renderDataVersionBadge();
    renderContent();
  }

  // Load saved state from LocalStorage
  function loadPersistentState() {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (savedTheme) {
        state.theme = savedTheme;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        state.theme = 'light';
      }

      const savedViewMode = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
      if (savedViewMode) {
        state.viewMode = savedViewMode;
      }

      const savedNotes = localStorage.getItem(STORAGE_KEYS.NOTES);
      if (savedNotes) {
        state.technicianNotes = JSON.parse(savedNotes);
      }

      const savedExp = localStorage.getItem(STORAGE_KEYS.EXPANDED_SPEAKERS);
      if (savedExp) {
        state.expandedSpeakers = JSON.parse(savedExp);
      }

      const savedHideStatus = localStorage.getItem(STORAGE_KEYS.HIDE_STATUS);
      if (savedHideStatus !== null) {
        state.hideStatus = (savedHideStatus === 'true');
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  // Cache DOM references
  function cacheDomElements() {
    dom = {
      body: document.body,
      // Top header pills
      topNotesBtn: document.getElementById('topNotesBtn'),
      topNotesCount: document.getElementById('topNotesCount'),
      dataVersionBtn: document.getElementById('dataVersionBtn'),
      topRoomsBtn: document.getElementById('topRoomsBtn'),
      topRoomsCount: document.getElementById('topRoomsCount'),

      // Day selector & 2-column grid
      daySelectorSection: document.getElementById('daySelectorSection'),
      dayCardsGrid: document.getElementById('dayCardsGrid'),
      totalSessionsStats: document.getElementById('totalSessionsStats'),

      // Active selection banner
      activeDayBanner: document.getElementById('activeDayBanner'),
      activeDayTitle: document.getElementById('activeDayTitle'),
      activeDaySubtitle: document.getElementById('activeDaySubtitle'),

      // Search
      searchInput: document.getElementById('searchInput'),
      searchClearBtn: document.getElementById('searchClearBtn'),

      // Content & Printing
      contentArea: document.getElementById('contentArea'),
      statsCount: document.getElementById('statsCount'),
      printHeader: document.getElementById('printHeader'),

      // Fixed Bottom Navigation Bar ("Botones de útiles abajo")
      bottomNavBar: document.getElementById('bottomNavBar'),
      navDaysBtn: document.getElementById('navDaysBtn'),
      navRoomsBtn: document.getElementById('navRoomsBtn'),
      navRoomBadge: document.getElementById('navRoomBadge'),
      navNotesBtn: document.getElementById('navNotesBtn'),
      navNotesBadge: document.getElementById('navNotesBadge'),
      navThemeBtn: document.getElementById('navThemeBtn'),
      navThemeIcon: document.getElementById('navThemeIcon'),
      navThemeLabel: document.getElementById('navThemeLabel'),
      navCompactBtn: document.getElementById('navCompactBtn'),
      navCompactIcon: document.getElementById('navCompactIcon'),
      navCompactLabel: document.getElementById('navCompactLabel'),
      navStatusBtn: document.getElementById('navStatusBtn'),
      navStatusIcon: document.getElementById('navStatusIcon'),
      navStatusLabel: document.getElementById('navStatusLabel'),
      navPrintBtn: document.getElementById('navPrintBtn'),

      // Rooms Modal
      roomsModal: document.getElementById('roomsModal'),
      closeRoomsModalBtn: document.getElementById('closeRoomsModalBtn'),
      closeRoomsModalFooterBtn: document.getElementById('closeRoomsModalFooterBtn'),
      roomsModalBody: document.getElementById('roomsModalBody'),

      // Version Modal
      versionModal: document.getElementById('versionModal'),
      closeVersionModalBtn: document.getElementById('closeVersionModalBtn'),
      closeVersionModalFooterBtn: document.getElementById('closeVersionModalFooterBtn'),
      versionModalBody: document.getElementById('versionModalBody'),
      copyUpdateCmdBtn: document.getElementById('copyUpdateCmdBtn'),

      // Notes Modal
      notesModal: document.getElementById('notesModal'),
      closeNotesModalBtn: document.getElementById('closeNotesModalBtn'),
      notesModalBody: document.getElementById('notesModalBody'),
      exportNotesBtn: document.getElementById('exportNotesBtn'),
      importNotesBtn: document.getElementById('importNotesBtn'),
      importNotesFileInput: document.getElementById('importNotesFileInput'),

      toastMessage: document.getElementById('toastMessage')
    };
  }

  // Set up event listeners
  function setupEventListeners() {
    // 1. Top Header Pills
    if (dom.topNotesBtn) {
      dom.topNotesBtn.addEventListener('click', openNotesModal);
    }
    if (dom.topRoomsBtn) {
      dom.topRoomsBtn.addEventListener('click', openRoomsModal);
    }
    if (dom.dataVersionBtn) {
      dom.dataVersionBtn.addEventListener('click', openVersionModal);
    }

    // 2. Fixed Bottom Navigation Bar ("Botones de útiles abajo")
    if (dom.navDaysBtn) {
      dom.navDaysBtn.addEventListener('click', function () {
        if (dom.daySelectorSection) {
          dom.daySelectorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    if (dom.navRoomsBtn) {
      dom.navRoomsBtn.addEventListener('click', openRoomsModal);
    }

    if (dom.navNotesBtn) {
      dom.navNotesBtn.addEventListener('click', openNotesModal);
    }

    if (dom.navThemeBtn) {
      dom.navThemeBtn.addEventListener('click', toggleTheme);
    }

    if (dom.navCompactBtn) {
      dom.navCompactBtn.addEventListener('click', toggleCompactMode);
    }

    if (dom.navStatusBtn) {
      dom.navStatusBtn.addEventListener('click', toggleStatusVisibility);
    }

    if (dom.navPrintBtn) {
      dom.navPrintBtn.addEventListener('click', triggerPrint);
    }

    // 3. Rooms Modal
    if (dom.closeRoomsModalBtn) {
      dom.closeRoomsModalBtn.addEventListener('click', closeRoomsModal);
    }
    if (dom.closeRoomsModalFooterBtn) {
      dom.closeRoomsModalFooterBtn.addEventListener('click', closeRoomsModal);
    }
    if (dom.roomsModal) {
      dom.roomsModal.addEventListener('click', function (e) {
        if (e.target === dom.roomsModal) {
          closeRoomsModal();
        }
      });
    }

    // 4. Data Version Modal
    if (dom.closeVersionModalBtn) {
      dom.closeVersionModalBtn.addEventListener('click', closeVersionModal);
    }
    if (dom.closeVersionModalFooterBtn) {
      dom.closeVersionModalFooterBtn.addEventListener('click', closeVersionModal);
    }
    if (dom.versionModal) {
      dom.versionModal.addEventListener('click', function (e) {
        if (e.target === dom.versionModal) {
          closeVersionModal();
        }
      });
    }
    if (dom.copyUpdateCmdBtn) {
      dom.copyUpdateCmdBtn.addEventListener('click', copyUpdateCommand);
    }

    // 5. Notes Modal
    if (dom.closeNotesModalBtn) {
      dom.closeNotesModalBtn.addEventListener('click', closeNotesModal);
    }
    if (dom.notesModal) {
      dom.notesModal.addEventListener('click', function (e) {
        if (e.target === dom.notesModal) {
          closeNotesModal();
        }
      });
    }
    if (dom.exportNotesBtn) {
      dom.exportNotesBtn.addEventListener('click', exportNotesToFile);
    }
    if (dom.importNotesBtn) {
      dom.importNotesBtn.addEventListener('click', function () {
        dom.importNotesFileInput.click();
      });
    }
    if (dom.importNotesFileInput) {
      dom.importNotesFileInput.addEventListener('change', handleImportNotesFile);
    }

    // 6. Search input & clear
    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', function (e) {
        state.searchQuery = e.target.value.trim().toLowerCase();
        if (dom.searchClearBtn) {
          dom.searchClearBtn.style.display = state.searchQuery ? 'block' : 'none';
        }
        renderContent();
      });
    }

    if (dom.searchClearBtn) {
      dom.searchClearBtn.addEventListener('click', function () {
        dom.searchInput.value = '';
        state.searchQuery = '';
        dom.searchClearBtn.style.display = 'none';
        renderContent();
      });
    }
  }

  // Theme Handling (SEMERGEN Dark/Light Mode)
  function applyTheme() {
    dom.body.setAttribute('data-theme', state.theme);
    if (dom.navThemeIcon) {
      dom.navThemeIcon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    }
    if (dom.navThemeLabel) {
      dom.navThemeLabel.textContent = state.theme === 'dark' ? 'Luz' : 'Noche';
    }
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
    } catch (e) {}
    applyTheme();
    showToast(state.theme === 'dark' ? 'Modo Sala Oscura activado' : 'Modo Claro activado');
  }

  // View Mode Handling (Detailed vs Compact A4 Density)
  function applyViewModeUI() {
    if (state.viewMode === 'compact') {
      dom.body.classList.add('compact-mode');
      if (dom.navCompactIcon) dom.navCompactIcon.textContent = '📄';
      if (dom.navCompactLabel) dom.navCompactLabel.textContent = 'Detalle';
    } else {
      dom.body.classList.remove('compact-mode');
      if (dom.navCompactIcon) dom.navCompactIcon.textContent = '⚡';
      if (dom.navCompactLabel) dom.navCompactLabel.textContent = 'Compacto';
    }
  }

  function toggleCompactMode() {
    const newMode = state.viewMode === 'compact' ? 'detailed' : 'compact';
    setViewMode(newMode);
    showToast(newMode === 'compact' ? 'Modo Comprimido activado (máxima densidad)' : 'Modo Detallado activado');
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    try {
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);
    } catch (e) {}
    applyViewModeUI();
    renderContent();
  }

  // Status Visibility Handling (Hide/Show state selector & notes workspace)
  function applyStatusVisibility() {
    if (state.hideStatus) {
      dom.body.classList.add('hide-status');
      if (dom.navStatusIcon) dom.navStatusIcon.textContent = '🙈';
      if (dom.navStatusLabel) dom.navStatusLabel.textContent = 'Estados';
      if (dom.navStatusBtn) dom.navStatusBtn.classList.add('active');
    } else {
      dom.body.classList.remove('hide-status');
      if (dom.navStatusIcon) dom.navStatusIcon.textContent = '👁️';
      if (dom.navStatusLabel) dom.navStatusLabel.textContent = 'Estados';
      if (dom.navStatusBtn) dom.navStatusBtn.classList.remove('active');
    }
  }

  function toggleStatusVisibility() {
    state.hideStatus = !state.hideStatus;
    try {
      localStorage.setItem(STORAGE_KEYS.HIDE_STATUS, String(state.hideStatus));
    } catch (e) {}
    applyStatusVisibility();
    showToast(state.hideStatus ? 'Estados y panel técnico ocultados' : 'Estados y panel técnico visibles');
  }

  // Render Day Cards 2-Column Grid (SEMERGEN Style)
  function renderDayCardsGrid() {
    if (!dom.dayCardsGrid || !window.CONGRESO_DATA) return;

    let totalSessionsAll = 0;
    const daysData = window.CONGRESO_DATA.days.map(function (d) {
      const count = d.sessions ? d.sessions.length : 0;
      totalSessionsAll += count;
      return {
        id: d.id,
        name: d.shortName || d.name,
        sessionsCount: count
      };
    });

    if (dom.totalSessionsStats) {
      dom.totalSessionsStats.textContent = `${totalSessionsAll} sesiones oficiales cargadas`;
    }

    let html = '';
    daysData.forEach(function (day) {
      const isActive = state.selectedDay === day.id;
      html += `
        <div class="day-card ${isActive ? 'active' : ''}" data-day="${day.id}" role="tab" aria-selected="${isActive}">
          <span class="day-card-title">${escapeHtml(day.name)}</span>
          <span class="day-card-sessions">${day.sessionsCount} sesiones</span>
        </div>
      `;
    });

    // Add "Todo el Congreso" card as 6th card (makes 3 rows of 2 cards)
    const isAllActive = state.selectedDay === 'all';
    html += `
      <div class="day-card ${isAllActive ? 'active' : ''}" data-day="all" role="tab" aria-selected="${isAllActive}">
        <span class="day-card-title">Todo el Congreso</span>
        <span class="day-card-sessions">${totalSessionsAll} sesiones</span>
      </div>
    `;

    dom.dayCardsGrid.innerHTML = html;

    // Attach click events
    dom.dayCardsGrid.querySelectorAll('.day-card').forEach(function (card) {
      card.addEventListener('click', function () {
        const dayId = this.getAttribute('data-day');
        state.selectedDay = dayId;
        dom.dayCardsGrid.querySelectorAll('.day-card').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        updateActiveDayBanner();
        renderContent();
      });
    });
  }

  // Update Active Selection Headline Banner
  function updateActiveDayBanner() {
    if (!dom.activeDayTitle || !window.CONGRESO_DATA) return;

    let dayTitle = 'TODO EL CONGRESO (18 - 22 OCTUBRE 2026)';
    if (state.selectedDay !== 'all') {
      const day = window.CONGRESO_DATA.days.find(d => d.id === state.selectedDay);
      if (day) {
        dayTitle = (day.fullDate || day.name).toUpperCase();
      }
    }
    dom.activeDayTitle.textContent = dayTitle;

    // Room Label
    let roomText = 'todas las salas';
    if (state.selectedRoom !== 'all') {
      const room = window.CONGRESO_DATA.rooms.find(r => r.id === state.selectedRoom);
      if (room) {
        roomText = room.name;
      }
    }

    // Count matching sessions
    let count = 0;
    window.CONGRESO_DATA.days.forEach(function (d) {
      d.sessions.forEach(function (s) {
        if (sessionMatchesFilters(s, d.id)) count++;
      });
    });

    if (dom.activeDaySubtitle) {
      dom.activeDaySubtitle.textContent = `${count} sesiones disponibles en ${roomText}`;
    }
  }

  // Rooms Selection Modal
  function renderRoomsModal() {
    if (!dom.roomsModalBody || !window.CONGRESO_DATA) return;

    let totalAll = 0;
    const roomCounts = {};
    window.CONGRESO_DATA.rooms.forEach(function (r) { roomCounts[r.id] = 0; });

    window.CONGRESO_DATA.days.forEach(function (d) {
      d.sessions.forEach(function (s) {
        totalAll++;
        if (roomCounts[s.roomCategory] !== undefined) {
          roomCounts[s.roomCategory]++;
        }
      });
    });

    let html = `<div class="room-selection-grid">`;

    // Option: Todas las salas
    const isAll = state.selectedRoom === 'all';
    html += `
      <button class="room-selection-btn ${isAll ? 'active' : ''}" data-room="all">
        <span class="room-btn-title"><span>🏛️</span> Todas las Salas del Congreso</span>
        <span class="room-btn-count">${totalAll} sesiones</span>
      </button>
    `;

    window.CONGRESO_DATA.rooms.forEach(function (room) {
      const isActive = state.selectedRoom === room.id;
      const count = roomCounts[room.id] || 0;
      html += `
        <button class="room-selection-btn ${isActive ? 'active' : ''}" data-room="${room.id}">
          <span class="room-btn-title"><span>📍</span> ${escapeHtml(room.name)}</span>
          <span class="room-btn-count">${count} sesiones</span>
        </button>
      `;
    });

    html += `</div>`;
    dom.roomsModalBody.innerHTML = html;

    dom.roomsModalBody.querySelectorAll('.room-selection-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const roomId = this.getAttribute('data-room');
        state.selectedRoom = roomId;
        updateRoomBadges();
        closeRoomsModal();
        updateActiveDayBanner();
        renderContent();
        showToast(roomId === 'all' ? 'Mostrando todas las salas' : `Filtrado por: ${this.querySelector('.room-btn-title').textContent.trim()}`);
      });
    });

    updateRoomBadges();
  }

  function updateRoomBadges() {
    const totalRoomsCount = window.CONGRESO_DATA ? window.CONGRESO_DATA.rooms.length : 6;
    const displayCount = state.selectedRoom === 'all' ? totalRoomsCount : 1;
    if (dom.topRoomsCount) dom.topRoomsCount.textContent = displayCount;
    if (dom.navRoomBadge) dom.navRoomBadge.textContent = displayCount;
  }

  function openRoomsModal() {
    if (dom.roomsModal) {
      renderRoomsModal();
      dom.roomsModal.classList.add('active');
    }
  }

  function closeRoomsModal() {
    if (dom.roomsModal) {
      dom.roomsModal.classList.remove('active');
    }
  }

  // Update Notes Badges Count (Top pill + Bottom nav badge)
  function updateNotesBadges() {
    const noteKeys = Object.keys(state.technicianNotes).filter(function (key) {
      const n = state.technicianNotes[key];
      return n && (n.text.trim() || n.status !== 'pending');
    });
    const count = noteKeys.length;

    if (dom.topNotesCount) {
      dom.topNotesCount.textContent = count;
    }
    if (dom.navNotesBadge) {
      dom.navNotesBadge.textContent = count;
      dom.navNotesBadge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  // Toggle All Speakers Globally
  function toggleAllSpeakers() {
    state.allSpeakersExpanded = !state.allSpeakersExpanded;
    if (dom.toggleAllSpeakersBtn) {
      dom.toggleAllSpeakersBtn.textContent = state.allSpeakersExpanded ? '🙈 Ocultar Todos los Ponentes' : '👥 Desplegar Ponentes';
    }

    // Update all sessions state
    window.CONGRESO_DATA.days.forEach(function (day) {
      day.sessions.forEach(function (sess) {
        state.expandedSpeakers[sess.id] = state.allSpeakersExpanded;
      });
    });

    try {
      localStorage.setItem(STORAGE_KEYS.EXPANDED_SPEAKERS, JSON.stringify(state.expandedSpeakers));
    } catch (e) {}

    renderContent();
  }

  // Toggle single session speakers
  window.toggleSessionSpeakers = function (sessionId) {
    state.expandedSpeakers[sessionId] = !state.expandedSpeakers[sessionId];
    try {
      localStorage.setItem(STORAGE_KEYS.EXPANDED_SPEAKERS, JSON.stringify(state.expandedSpeakers));
    } catch (e) {}
    
    const drawer = document.getElementById('drawer-' + sessionId);
    const btn = document.getElementById('btn-spk-' + sessionId);
    if (drawer && btn) {
      if (state.expandedSpeakers[sessionId]) {
        drawer.classList.add('open');
        btn.innerHTML = '🙈 Ocultar ponentes';
      } else {
        drawer.classList.remove('open');
        btn.innerHTML = '👁️ Ver ponentes';
      }
    }
  };

  // Technician Note Management
  window.handleNoteChange = function (talkId, text) {
    if (!state.technicianNotes[talkId]) {
      state.technicianNotes[talkId] = { status: 'pending', text: '', updatedAt: new Date().toISOString() };
    }
    state.technicianNotes[talkId].text = text;
    state.technicianNotes[talkId].updatedAt = new Date().toISOString();
    saveNotesToStorage();
    updateNoteBadge(talkId);
  };

  window.handleStatusChange = function (talkId, newStatus) {
    if (!state.technicianNotes[talkId]) {
      state.technicianNotes[talkId] = { status: 'pending', text: '', updatedAt: new Date().toISOString() };
    }
    state.technicianNotes[talkId].status = newStatus;
    state.technicianNotes[talkId].updatedAt = new Date().toISOString();
    saveNotesToStorage();
    updateNoteBadge(talkId);
    showToast(`Estado cambiado a: ${getStatusLabel(newStatus)}`);
  };

  window.clearTalkNote = function (talkId) {
    if (state.technicianNotes[talkId]) {
      if (confirm('¿Eliminar la nota de esta charla?')) {
        delete state.technicianNotes[talkId];
        saveNotesToStorage();
        const textarea = document.getElementById('note-txt-' + talkId);
        if (textarea) textarea.value = '';
        const select = document.getElementById('status-sel-' + talkId);
        if (select) select.value = 'pending';
        updateNoteBadge(talkId);
        showToast('Nota eliminada');
      }
    }
  };

  window.copyTalkNote = function (talkId) {
    const note = state.technicianNotes[talkId];
    if (note && note.text) {
      navigator.clipboard.writeText(note.text).then(() => {
        showToast('Nota copiada al portapapeles');
      }).catch(() => {
        showToast('No se pudo copiar');
      });
    } else {
      showToast('No hay nota para copiar');
    }
  };

  function updateNoteBadge(talkId) {
    const badge = document.getElementById('note-badge-' + talkId);
    const item = document.getElementById(talkId);
    const note = state.technicianNotes[talkId];
    const hasNote = Boolean(note && (note.text || note.status !== 'pending'));
    const hasTextNote = Boolean(note && note.text && note.text.trim());

    if (badge) {
      if (hasNote) {
        badge.style.display = 'inline-flex';
        badge.innerHTML = `📝 ${getStatusLabel(note.status)}`;
      } else {
        badge.style.display = 'none';
      }
    }

    if (item) {
      if (hasTextNote) {
        item.classList.add('has-printed-note');
        const printNoteEl = item.querySelector('.printed-note-content');
        if (printNoteEl) {
          printNoteEl.innerHTML = `📝 <strong>Nota:</strong> ${escapeHtml(note.text)}`;
        }
      } else {
        item.classList.remove('has-printed-note');
      }
    }
  }

  function renderDataVersionBadge() {
    if (!dom.dataVersionBadge) return;
    const meta = (window.CONGRESO_DATA && window.CONGRESO_DATA.metadata) || {};
    const dateStr = meta.lastUpdatedDisplay ? meta.lastUpdatedDisplay.split(' ')[0] : '09/10/2026';
    dom.dataVersionBadge.textContent = `Datos: ${dateStr}`;
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'progress': return '🟢 En curso';
      case 'completed': return '✅ Realizada';
      case 'issue': return '⚠️ Incidencia';
      default: return '⚪ Pendiente';
    }
  }

  function saveNotesToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(state.technicianNotes));
    } catch (e) {
      console.error('Error saving notes:', e);
    }
    updateNotesBadges();
  }

  // Filter Matching Logic
  function sessionMatchesFilters(session, dayId) {
    // 1. Day filter
    if (state.selectedDay !== 'all' && state.selectedDay !== dayId) {
      return false;
    }

    // 2. Room filter
    if (state.selectedRoom !== 'all') {
      if (session.roomCategory !== state.selectedRoom) {
        return false;
      }
    }

    // 3. Search query
    if (state.searchQuery) {
      const q = state.searchQuery;
      const titleMatch = (session.title || '').toLowerCase().includes(q);
      const codeMatch = (session.code || '').toLowerCase().includes(q);
      const roomMatch = (session.room || '').toLowerCase().includes(q);
      const chairMatch = (session.chairs || []).some(c => c.toLowerCase().includes(q));

      const talkMatch = (session.talks || []).some(function (t) {
        const tTitle = (t.title || '').toLowerCase().includes(q);
        const tSpk = (t.speakers || '').toLowerCase().includes(q);
        const tAff = (t.affiliation || '').toLowerCase().includes(q);
        const tCode = (t.posterCode || '').toLowerCase().includes(q);
        const userNote = state.technicianNotes[t.id];
        const noteMatch = userNote && userNote.text && userNote.text.toLowerCase().includes(q);
        return tTitle || tSpk || tAff || tCode || noteMatch;
      });

      if (!titleMatch && !codeMatch && !roomMatch && !chairMatch && !talkMatch) {
        return false;
      }
    }

    return true;
  }

  // Main Render Function
  function renderContent() {
    if (!dom.contentArea || !window.CONGRESO_DATA) return;

    let html = '';
    let totalSessionsRendered = 0;
    let totalTalksRendered = 0;

    window.CONGRESO_DATA.days.forEach(function (day) {
      const filteredSessions = day.sessions.filter(function (sess) {
        return sessionMatchesFilters(sess, day.id);
      });

      if (filteredSessions.length === 0) return;

      totalSessionsRendered += filteredSessions.length;

      html += `
        <div class="day-group" id="day-group-${day.id}">
          <div class="day-banner">
            <span class="day-banner-title">📅 ${day.fullDate}</span>
            <span class="day-banner-count">${filteredSessions.length} sesiones / eventos</span>
          </div>
          <div class="sessions-container">
      `;

      filteredSessions.forEach(function (session) {
        totalTalksRendered += (session.talks ? session.talks.length : 0);
        html += renderSessionCard(session, day.id);
      });

      html += `
          </div>
        </div>
      `;
    });

    if (totalSessionsRendered === 0) {
      html = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No se encontraron sesiones ni ponencias</h3>
          <p>Prueba a cambiar el filtro de sala o limpiar el texto de búsqueda.</p>
        </div>
      `;
    } else {
      // Floating Dark Room Pill (Notice as in reference screenshot)
      html += `
        <div class="dark-room-pill" id="darkRoomNotice">
          <span>🌙</span> <span>Modo Sala Oscura activado (baja emisión lumínica)</span>
        </div>
      `;
    }

    dom.contentArea.innerHTML = html;

    // Update stats count in tools bar
    if (dom.statsCount) {
      dom.statsCount.textContent = `Mostrando ${totalSessionsRendered} sesiones · ${totalTalksRendered} charlas`;
    }
  }

  // Render Single Session Card (SEMERGEN Style)
  function renderSessionCard(session, dayId) {
    const isSpeakersOpen = Boolean(state.expandedSpeakers[session.id]);
    const roomBadgeText = session.roomShort || session.room;
    
    // Check if all talks completed
    const hasTalks = session.talks && session.talks.length > 0;
    const isAllCompleted = hasTalks && session.talks.every(function (t) {
      const n = state.technicianNotes[t.id];
      return n && n.status === 'completed';
    });

    let sessionTypeTag = session.code || 'SESIÓN';
    if (session.talks && session.talks.length > 0) {
      const firstType = session.talks[0].type || '';
      if (firstType.toUpperCase().includes('KEYNOTE')) sessionTypeTag = 'KEYNOTE';
      else if (firstType.toUpperCase().includes('PLENARY')) sessionTypeTag = 'PLENARIA';
      else if (firstType.toUpperCase().includes('POSTER')) sessionTypeTag = 'POSTER';
      else if (firstType.toUpperCase().includes('ORAL')) sessionTypeTag = 'DEFENSA ORAL';
    }

    let html = `
      <article class="session-card" id="${session.id}">
        <div class="session-header">
          <div class="session-badges-row">
            <span class="badge-tag-type">${escapeHtml(sessionTypeTag)}</span>
            <span class="badge-tag-venue">🏛️ PALACIO</span>
            <span class="badge-tag-room" title="${escapeHtml(session.room || '')}">📍 ${escapeHtml(roomBadgeText)}</span>
            <span class="badge-time" style="margin-left: auto;">⏰ ${session.timeStart || ''} ${session.timeEnd ? '- ' + session.timeEnd : ''}</span>
          </div>
          
          <h2 class="session-title">${escapeHtml(session.title)}</h2>
          
          <div class="session-actions-bar">
            <button class="btn-speakers-link" id="btn-spk-${session.id}" onclick="toggleSessionSpeakers('${session.id}')">
              ${isSpeakersOpen ? '🙈 Ocultar Ponentes' : 'Ver Ponentes'}
            </button>
            
            <div class="session-right-actions">
              <button class="btn-action-pill" onclick="toggleSessionSpeakers('${session.id}')" title="Ver ponencias y notas">
                📝 Nota
              </button>
              <button class="btn-action-pill finish-btn ${isAllCompleted ? 'completed' : ''}" onclick="toggleSessionFinish('${session.id}')" title="Marcar/Desmarcar sesión como finalizada">
                ${isAllCompleted ? '✓ Finalizada' : '✓ Terminar'}
              </button>
            </div>
          </div>
        </div>
        
        <!-- Accordion Drawer for Speakers, Moderators & Individual Talk Notes -->
        <div class="session-speakers-drawer ${isSpeakersOpen ? 'open' : ''}" id="drawer-${session.id}">
          ${renderSpeakersDrawerContent(session)}
        </div>
        
        <!-- List of Talks in this session -->
        <div class="talks-list">
    `;

    (session.talks || []).forEach(function (talk) {
      html += renderTalkItem(talk, session);
    });

    html += `
        </div>
      </article>
    `;

    return html;
  }

  // Toggle Session Completion (Marks/Unmarks all talks in session)
  window.toggleSessionFinish = function (sessionId) {
    if (!window.CONGRESO_DATA) return;
    for (let d of window.CONGRESO_DATA.days) {
      for (let s of d.sessions) {
        if (s.id === sessionId) {
          const hasTalks = s.talks && s.talks.length > 0;
          if (!hasTalks) return;
          const isAllCompleted = s.talks.every(function (t) {
            const n = state.technicianNotes[t.id];
            return n && n.status === 'completed';
          });
          const newStatus = isAllCompleted ? 'pending' : 'completed';
          s.talks.forEach(function (t) {
            if (!state.technicianNotes[t.id]) {
              state.technicianNotes[t.id] = { status: 'pending', text: '', updatedAt: new Date().toISOString() };
            }
            state.technicianNotes[t.id].status = newStatus;
            state.technicianNotes[t.id].updatedAt = new Date().toISOString();
          });
          saveNotesToStorage();
          renderContent();
          showToast(newStatus === 'completed' ? 'Sesión marcada como Finalizada' : 'Sesión reabierta como Pendiente');
          return;
        }
      }
    }
  };

  // Render Drawer Content (Moderators + Quick Speaker List)
  function renderSpeakersDrawerContent(session) {
    let html = '';
    
    // Moderators Section
    html += `
      <div class="drawer-section-title">👔 Moderadores / Chairs (${(session.chairs && session.chairs.length) || 0})</div>
      <div class="moderator-list">
    `;

    if (session.chairs && session.chairs.length > 0) {
      session.chairs.forEach(function (chair) {
        html += `
          <div class="moderator-item">
            <span class="moderator-badge">Chair</span>
            <span><strong>${chair}</strong></span>
          </div>
        `;
      });
    } else {
      html += `<div class="moderator-item"><em>Secretaría / Dirección de Sala</em></div>`;
    }

    html += `</div>`;

    // Ponentes Section
    html += `
      <div class="drawer-section-title">🎤 Ponentes y Títulos de las Charlas</div>
      <div class="speaker-quick-list">
    `;

    (session.talks || []).forEach(function (talk) {
      html += `
        <div class="speaker-quick-item">
          <span class="speaker-time">${talk.time || '--:--'}</span>
          <div>
            <strong>${talk.speakers || 'Ponente asignado'}</strong> — <span style="opacity: 0.85;">${talk.title}</span>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  }

  // Render Single Talk Item with Technician Note & Status Tools
  function renderTalkItem(talk, session) {
    const savedNote = state.technicianNotes[talk.id] || { status: 'pending', text: '' };
    const hasNote = Boolean(savedNote.text || savedNote.status !== 'pending');
    const hasTextNote = Boolean(savedNote.text && savedNote.text.trim());
    
    let typeClass = 'oral';
    const lowerType = (talk.type || '').toLowerCase();
    if (lowerType.includes('keynote') || lowerType.includes('hot topic')) typeClass = 'keynote';
    else if (lowerType.includes('plenary')) typeClass = 'plenary';
    else if (lowerType.includes('poster')) typeClass = 'poster';
    else if (lowerType.includes('techtalk')) typeClass = 'techtalk';

    return `
      <div class="talk-item ${hasTextNote ? 'has-printed-note' : ''}" id="${talk.id}">
        <div class="talk-header-row">
          <div class="talk-time-type">
            <span class="talk-time">⏰ ${talk.time || '--:--'}</span>
            <span class="talk-type-badge ${typeClass}">${talk.type || 'ORAL'}</span>
            ${talk.posterCode ? `<span class="badge-code">${talk.posterCode}</span>` : ''}
          </div>
          
          <span class="has-notes-badge" id="note-badge-${talk.id}" style="${hasNote ? 'display:inline-flex;' : 'display:none;'}">
            📝 ${getStatusLabel(savedNote.status)}
          </span>
        </div>
        
        <h3 class="talk-title">${talk.title}</h3>
        
        <div class="talk-authors">
          <span>👤 <strong>${talk.speakers}</strong></span>
        </div>
        
        ${talk.affiliation ? `<div class="talk-affil">🏛️ ${talk.affiliation}</div>` : ''}
        ${talk.officialNote ? `<div class="talk-official-note">📌 ${talk.officialNote}</div>` : ''}
        
        <!-- Technician Workspace / Notes Section for Stage AV Tech -->
        <div class="technician-bar">
          <div class="printed-note-content">
            ${hasTextNote ? `📝 <strong>Nota:</strong> ${escapeHtml(savedNote.text)}` : ''}
          </div>

          <div class="tech-bar-top">
            <div class="status-picker">
              <span class="status-label">Estado:</span>
              <select class="status-select" id="status-sel-${talk.id}" onchange="handleStatusChange('${talk.id}', this.value)">
                <option value="pending" ${savedNote.status === 'pending' ? 'selected' : ''}>⚪ Pendiente</option>
                <option value="progress" ${savedNote.status === 'progress' ? 'selected' : ''}>🟢 En curso</option>
                <option value="completed" ${savedNote.status === 'completed' ? 'selected' : ''}>✅ Realizada</option>
                <option value="issue" ${savedNote.status === 'issue' ? 'selected' : ''}>⚠️ Incidencia</option>
              </select>
            </div>
            
            <div class="note-actions-row">
              <button class="btn-tech-subtle" onclick="copyTalkNote('${talk.id}')" title="Copiar nota al portapapeles">
                📋 Copiar
              </button>
              <button class="btn-tech-subtle" onclick="clearTalkNote('${talk.id}')" title="Borrar nota">
                🗑️ Borrar
              </button>
            </div>
          </div>
          
          <textarea 
            class="note-textarea" 
            id="note-txt-${talk.id}" 
            placeholder="Añadir nota técnica para esta charla (ej: presentación cargada, micro solapa OK, preguntas...)"
            oninput="handleNoteChange('${talk.id}', this.value)"
          >${escapeHtml(savedNote.text || '')}</textarea>
        </div>
      </div>
    `;
  }

  // Notes Modal Management
  function openNotesModal() {
    if (!dom.notesModal || !dom.notesModalBody) return;

    const noteKeys = Object.keys(state.technicianNotes).filter(function (key) {
      const n = state.technicianNotes[key];
      return n && (n.text.trim() || n.status !== 'pending');
    });

    let html = '';

    if (noteKeys.length === 0) {
      html = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h3>Aún no has añadido ninguna nota técnica</h3>
          <p>Escribe notas o cambia el estado de cualquier ponencia y aparecerán automáticamente aquí guardadas.</p>
        </div>
      `;
    } else {
      html = `<div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">Total de notas registradas: <strong>${noteKeys.length}</strong></div>`;
      
      // Look up talk info
      noteKeys.forEach(function (talkId) {
        const note = state.technicianNotes[talkId];
        const talkInfo = findTalkById(talkId);
        
        html += `
          <div class="note-summary-card">
            <div class="note-summary-header">
              <span><strong>${talkInfo.sessionCode || 'Charla'}</strong> · ${talkInfo.talkTime || ''} (${talkInfo.room || ''})</span>
              <span>${getStatusLabel(note.status)}</span>
            </div>
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${talkInfo.title}</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">👤 ${talkInfo.speakers}</div>
            <div class="note-summary-text">${note.text || '<em>(Sin texto de nota, solo estado modificado)</em>'}</div>
          </div>
        `;
      });
    }

    dom.notesModalBody.innerHTML = html;
    dom.notesModal.classList.add('active');
  }

  function closeNotesModal() {
    if (dom.notesModal) {
      dom.notesModal.classList.remove('active');
    }
  }

  function findTalkById(talkId) {
    if (!window.CONGRESO_DATA) return { title: 'Charla ' + talkId, speakers: '', room: '', sessionCode: '' };

    for (let d of window.CONGRESO_DATA.days) {
      for (let s of d.sessions) {
        for (let t of s.talks) {
          if (t.id === talkId) {
            return {
              title: t.title,
              speakers: t.speakers,
              talkTime: t.time,
              sessionCode: s.code,
              room: s.roomShort || s.room
            };
          }
        }
      }
    }
    return { title: 'Charla ' + talkId, speakers: '', room: '', sessionCode: '' };
  }

  // Export Notes to JSON
  function exportNotesToFile() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.technicianNotes, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `microtas_2026_notas_tecnicas_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Archivo de notas descargado');
  }

  // Handle Import Notes JSON
  function handleImportNotesFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported === 'object') {
          state.technicianNotes = Object.assign({}, state.technicianNotes, imported);
          saveNotesToStorage();
          renderContent();
          closeNotesModal();
          showToast('Notas importadas con éxito');
        }
      } catch (err) {
        alert('El archivo no tiene un formato JSON válido.');
      }
    };
    reader.readAsText(file);
  }

  // Jump to Current or Next Session
  function jumpToCurrentOrNextSession() {
    const cards = document.querySelectorAll('.session-card');
    if (cards.length > 0) {
      // Smooth scroll to top of current filtered list or first upcoming
      cards[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('Posicionado en la primera sesión disponible');
    }
  }

  // Toast Notification Helper
  function showToast(msg) {
    if (!dom.toastMessage) return;
    dom.toastMessage.textContent = msg;
    dom.toastMessage.classList.add('show');
    clearTimeout(dom.toastTimer);
    dom.toastTimer = setTimeout(function () {
      dom.toastMessage.classList.remove('show');
    }, 2400);
  }

  // Trigger Print Dialog with Optimized A4 Header
  function triggerPrint() {
    if (!window.CONGRESO_DATA) return;

    // 1. Determine active Day label
    let dayLabel = 'Todo el Congreso (18 - 22 Octubre 2026)';
    if (state.selectedDay !== 'all') {
      const foundDay = window.CONGRESO_DATA.days.find(d => d.id === state.selectedDay);
      if (foundDay) {
        dayLabel = foundDay.fullDate || foundDay.name;
      }
    }

    // 2. Determine active Room label
    let roomLabel = 'Todas las Salas y Espacios';
    if (state.selectedRoom !== 'all') {
      const foundRoom = window.CONGRESO_DATA.rooms.find(r => r.id === state.selectedRoom);
      if (foundRoom) {
        roomLabel = `${foundRoom.name} (${foundRoom.floor || ''})`;
      }
    }

    // 3. Search query info
    const searchFilter = state.searchQuery ? `Filtro de búsqueda: "${state.searchQuery}"` : 'Sin filtro de búsqueda';

    // 4. View mode
    const modeLabel = state.viewMode === 'compact' ? '⚡ Modo Comprimido (Máxima densidad A4)' : '📄 Modo Detallado';

    // 5. Data Version / Metadata
    const meta = window.CONGRESO_DATA.metadata || {};
    const dataDate = meta.lastUpdatedDisplay || '09/10/2026 11:28';
    const sourcePdf = meta.sourcePdf || 'MicroTAS2026_Program.pdf';

    // 6. Current counts
    const cards = document.querySelectorAll('.session-card');
    const talks = document.querySelectorAll('.talk-item');

    // Build print header HTML
    if (dom.printHeader) {
      dom.printHeader.innerHTML = `
        <div class="print-header-top">
          <div>
            <div class="print-title">MicroTAS 2026 Granada · Palacio de Congresos</div>
            <div class="print-subtitle">Herramienta Técnica AV & Personal de Sala · Hoja de Programa Oficial</div>
          </div>
          <div style="text-align: right; font-size: 8.5px; color: #475569;">
            <div><strong>Datos PDF:</strong> ${dataDate} (${sourcePdf})</div>
            <div><strong>Impreso:</strong> ${new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
        <div class="print-meta-grid">
          <div class="print-meta-item">📅 <strong>Día:</strong> ${dayLabel}</div>
          <div class="print-meta-item">📍 <strong>Sala:</strong> ${roomLabel}</div>
          <div class="print-meta-item">🔍 <strong>${searchFilter}</strong></div>
          <div class="print-meta-item">📊 <strong>Vista:</strong> ${modeLabel} (${cards.length} ses. / ${talks.length} charlas)</div>
        </div>
      `;
    }

    // Trigger system print
    window.print();
  }

  // Open Data Version and PDF Update Information Modal
  function openVersionModal() {
    if (!dom.versionModal || !dom.versionModalBody || !window.CONGRESO_DATA) return;

    const meta = window.CONGRESO_DATA.metadata || {};
    const lastUpdated = meta.lastUpdatedDisplay || '09/10/2026 11:28';
    const pdfModified = meta.pdfModified || '09/10/2026 11:02';
    const sourcePdf = meta.sourcePdf || 'MicroTAS2026_Program.pdf';
    const totalSessions = meta.totalSessions || 65;
    const totalTalks = meta.totalTalks || 196;

    const noteKeys = Object.keys(state.technicianNotes).filter(function (key) {
      const n = state.technicianNotes[key];
      return n && (n.text.trim() || n.status !== 'pending');
    });

    dom.versionModalBody.innerHTML = `
      <div class="version-status-card">
        <div class="version-status-badge">
          <span>✅</span> Base de Datos Sincronizada y Activa
        </div>
        <h3 style="margin-top: 6px; font-size: 15px; color: var(--text-primary);">
          Programa Oficial MicroTAS 2026 Granada
        </h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
          Datos extraídos con máxima precisión directamente del documento oficial del congreso.
        </p>

        <div class="version-grid">
          <div class="version-stat">
            <span class="v-label">Fecha de Incorporación</span>
            <span class="v-value" style="color: var(--accent-cyan); font-weight: 800;">${lastUpdated}</span>
          </div>
          <div class="version-stat">
            <span class="v-label">Archivo PDF Origen</span>
            <span class="v-value" style="font-family: monospace;">${sourcePdf}</span>
          </div>
          <div class="version-stat">
            <span class="v-label">Fecha del Archivo PDF</span>
            <span class="v-value">${pdfModified}</span>
          </div>
          <div class="version-stat">
            <span class="v-label">Volumen de Datos</span>
            <span class="v-value">${totalSessions} sesiones · ${totalTalks} ponencias</span>
          </div>
        </div>
      </div>

      <div class="version-notes-guarantee">
        <div style="font-size: 20px;">🛡️</div>
        <div>
          <strong style="color: var(--text-primary); font-size: 13px;">Garantía de Persistencia de tus Notas Técnicas</strong>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
            Tienes <strong>${noteKeys.length}</strong> notas técnicas guardadas en este dispositivo. Al actualizar el programa con nuevas versiones del PDF, tus notas, incidencias y estados <strong>NO se borran</strong>: permanecen vinculadas en tu navegador.
          </div>
        </div>
      </div>

      <div class="version-update-box">
        <h4 style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <span>🔄</span> Procedimiento para actualizar sesiones con un nuevo PDF
        </h4>
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
          Si la organización del congreso publica más adelante una nueva versión revisada del programa (con cambios de ponentes, salas u horarios):
        </p>
        
        <ol class="update-steps-list">
          <li>
            <strong>Reemplaza el archivo:</strong> Guarda el nuevo PDF en la carpeta del congreso con el nombre <code>${sourcePdf}</code> (o proporciónamelo para que lo procese).
          </li>
          <li>
            <strong>Regenera la base de datos:</strong> Ejecuta el comando de actualización o pídemelo directamente: <em>"Actualiza las sesiones con el nuevo PDF"</em>.
          </li>
          <li>
            <strong>Disfruta de la nueva versión:</strong> La aplicación registrará automáticamente la nueva fecha de incorporación, refrescará todas las sesiones y conservará intactas todas tus notas.
          </li>
        </ol>

        <div class="code-terminal-box">
          <code>python generate_final_dataset.py &amp;&amp; python make_standalone.py</code>
        </div>
      </div>
    `;

    dom.versionModal.classList.add('active');
  }

  function closeVersionModal() {
    if (dom.versionModal) {
      dom.versionModal.classList.remove('active');
    }
  }

  function copyUpdateCommand() {
    const cmd = 'python generate_final_dataset.py && python make_standalone.py';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(() => {
        showToast('Comando de actualización copiado');
      }).catch(() => {
        showToast('Comando: ' + cmd);
      });
    } else {
      showToast('Comando: ' + cmd);
    }
  }

  // HTML escaping helper to prevent injection or broken quotes
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Start on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
