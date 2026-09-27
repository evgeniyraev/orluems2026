/**
 * Programme renderer, live-session highlighting and countdown.
 * Source of truth: assets/data/programme.json
 *
 * Markup hooks:
 *   <div data-programme="sessions|overview"></div>  – schedule tabs are rendered here
 *   <div data-countdown>…</div>                        – countdown card (index.html)
 *
 * For testing, append ?now=2026-10-03T11:15 to the URL to simulate a moment
 * (interpreted in the event's timezone).
 */
(function() {
  "use strict";

  const DATA_URL = 'assets/data/programme.json';
  // Sessions without an end time (dinners) are considered live for this long.
  const OPEN_ENDED_MS = 3 * 60 * 60 * 1000;
  // Calendar events get a reminder this many minutes before the start.
  const REMINDER_MINUTES = 15;
  const SITE_URL = 'https://orluems2026.com/programme.html';

  let programme = null;
  let nowOffset = 0;
  // Sessions picked in select mode, keyed "day-session".
  const selected = new Set();

  function now() {
    return new Date(Date.now() + nowOffset);
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function toDate(date, time) {
    const [h, m] = time.split(':');
    return new Date(`${date}T${h.padStart(2, '0')}:${m}:00${programme.event.timezone}`);
  }

  // Attach absolute start/end timestamps to every session.
  function prepare() {
    programme.days.forEach((day) => {
      ['sessions', 'overview'].forEach((key) => {
        (day[key] || []).forEach((s) => {
          s.startAt = toDate(day.date, s.start);
          s.endAt = s.end ? toDate(day.date, s.end) : new Date(s.startAt.getTime() + OPEN_ENDED_MS);
        });
      });
    });
  }

  function allSessions() {
    return programme.days.flatMap((day) => day.sessions);
  }

  /**
   * Rendering
   */
  function renderBody(s) {
    let html = '';
    if (s.description) {
      html += `<p class="session-description">${esc(s.description)}</p>`;
    }
    if (s.items) {
      html += '<ul class="session-description">' + s.items.map((item) =>
        `<li>${esc(item.text)}${item.speaker ? ` <em>(${esc(item.speaker)})</em>` : ''}</li>`
      ).join('') + '</ul>';
    }
    if (s.speaker) {
      html += `<p class="session-description"><i class="bi bi-person"></i> ${esc(s.speaker)}</p>`;
    }
    return html;
  }

  function renderCalendarButton(dayIndex, sessionIndex) {
    const ref = `data-day="${dayIndex}" data-session="${sessionIndex}"`;
    return `
          <div class="dropdown add-to-calendar">
            <button type="button" class="add-to-schedule" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-calendar-plus"></i>Add to calendar
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><button type="button" class="dropdown-item" data-calendar="ics" ${ref}><i class="bi bi-apple"></i> Apple / Outlook (.ics)</button></li>
              <li><button type="button" class="dropdown-item" data-calendar="google" ${ref}><i class="bi bi-google"></i> Google Calendar</button></li>
            </ul>
          </div>`;
  }

  function renderSession(s, dayIndex, sessionIndex, withCalendar) {
    const isBreak = s.track === 'break';
    return `
      <div class="session-block ${esc(s.track)}${withCalendar && !isBreak ? ' is-selectable' : ''}" data-day="${dayIndex}" data-session="${sessionIndex}">
        <div class="session-time">
          <span class="start">${esc(s.start)}</span>
          <span class="end">${s.end ? esc(s.end) : '&nbsp;'}</span>
        </div>
        <div class="session-card${isBreak ? ' break-card' : ''}">
          <div class="session-info">
            <div class="session-meta">
              <span class="track ${esc(s.track)}">${esc(s.label)}</span>
              ${s.room ? `<span class="room">${esc(s.room)}</span>` : ''}
              <span class="live-badge"><i class="bi bi-broadcast"></i> Live now</span>
            </div>
            <h3 class="session-title">${esc(s.title)}</h3>
            ${renderBody(s)}
          </div>
          ${withCalendar && !isBreak ? renderCalendarButton(dayIndex, sessionIndex) + `
          <button type="button" class="select-check" role="checkbox" aria-checked="false"
            aria-label="Select ${esc(s.title)}"><i class="bi bi-check-lg"></i></button>` : ''}
        </div>
      </div>`;
  }

  function renderProgramme(container) {
    const key = container.dataset.programme || 'sessions';
    const prefix = `schedule-${key}`;
    const days = programme.days;

    const tabs = days.map((day, i) => `
      <li class="nav-item" role="presentation">
        <button class="nav-link${i === 0 ? ' active' : ''}" id="${prefix}-tab-${i}" data-bs-toggle="tab"
          data-bs-target="#${prefix}-pane-${i}" type="button" role="tab" aria-controls="${prefix}-pane-${i}"
          aria-selected="${i === 0}">${esc(day.label)}<br>${esc(day.weekday)}</button>
      </li>`).join('');

    const panes = days.map((day, i) => `
      <div class="tab-pane fade${i === 0 ? ' show active' : ''}" id="${prefix}-pane-${i}" role="tabpanel"
        aria-labelledby="${prefix}-tab-${i}" tabindex="0">
        <div class="schedule-content">
          <div class="session-timeline">
            ${(day[key] || []).map((s, j) => renderSession(s, i, j, key === 'sessions')).join('')}
          </div>
        </div>
      </div>`).join('');

    container.innerHTML = `
      ${key === 'sessions' ? `
      <div class="programme-select" data-select-bar>
        <button type="button" class="select-btn" data-select="start">
          <i class="bi bi-check2-square"></i> Select sessions
        </button>
        <div class="select-tools">
          <button type="button" class="select-btn" data-select="all"></button>
          <span class="select-count" aria-live="polite"></span>
          <button type="button" class="select-btn primary" data-select="add">
            <i class="bi bi-calendar-plus"></i> Add to calendar
          </button>
          <button type="button" class="select-btn icon" data-select="cancel" aria-label="Cancel selection">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>` : ''}
      <div class="schedule-header">
        <ul class="nav nav-tabs" role="tablist">${tabs}</ul>
      </div>
      <div class="tab-content">${panes}</div>`;
  }

  /**
   * Select mode: pick several sessions and export them as one .ics.
   */
  function selectableKeys() {
    return programme.days.flatMap((day, i) => day.sessions
      .map((s, j) => (s.track === 'break' ? null : `${i}-${j}`))
      .filter(Boolean));
  }

  function updateSelection(container) {
    const total = selectableKeys().length;
    container.querySelectorAll('.session-block.is-selectable').forEach((block) => {
      const on = selected.has(`${block.dataset.day}-${block.dataset.session}`);
      block.classList.toggle('is-selected', on);
      block.querySelector('.select-check').setAttribute('aria-checked', on);
    });
    const bar = container.querySelector('[data-select-bar]');
    if (!bar) return;
    const allSelected = selected.size === total;
    bar.querySelector('[data-select="all"]').innerHTML = allSelected
      ? '<i class="bi bi-square"></i> Clear all'
      : '<i class="bi bi-check-all"></i> Select all';
    bar.querySelector('.select-count').textContent = `${selected.size} of ${total} selected`;
    bar.querySelector('[data-select="add"]').disabled = !selected.size;
  }

  function setSelecting(container, on) {
    selected.clear();
    container.classList.toggle('is-selecting', on);
    const header = document.querySelector('#header');
    const bar = container.querySelector('[data-select-bar]');
    if (bar) bar.style.top = `${(header ? header.offsetHeight : 0) + 12}px`;
    updateSelection(container);
  }

  function addSelected(container) {
    const events = selectableKeys()
      .filter((k) => selected.has(k))
      .map((k) => {
        const [i, j] = k.split('-').map(Number);
        return icsEvent(programme.days[i].sessions[j], i, j);
      });
    if (!events.length) return;
    setSelecting(container, false);
    downloadIcs(icsCalendar(events), 'uems-orl-sofia-2026.ics');
  }

  function onSelectClick(e) {
    const container = e.currentTarget;
    const action = e.target.closest('[data-select]');
    if (action) {
      const type = action.dataset.select;
      if (type === 'start') setSelecting(container, true);
      if (type === 'cancel') setSelecting(container, false);
      if (type === 'add') addSelected(container);
      if (type === 'all') {
        const keys = selectableKeys();
        if (selected.size === keys.length) selected.clear();
        else keys.forEach((k) => selected.add(k));
        updateSelection(container);
      }
      return;
    }

    if (!container.classList.contains('is-selecting')) return;
    const block = e.target.closest('.session-block.is-selectable');
    if (!block) return;
    const k = `${block.dataset.day}-${block.dataset.session}`;
    if (selected.has(k)) selected.delete(k);
    else selected.add(k);
    updateSelection(container);
  }

  /**
   * Calendar export (.ics / Google Calendar)
   */
  function icsDate(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function icsText(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // RFC 5545: lines longer than 75 octets are folded with CRLF + space.
  function icsFold(line) {
    const out = [];
    let current = '';
    let bytes = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 74) {
        out.push(current);
        current = ' ';
        bytes = 1;
      }
      current += char;
      bytes += size;
    }
    out.push(current);
    return out.join('\r\n');
  }

  function sessionDetails(s) {
    const lines = [];
    if (s.description) lines.push(s.description);
    (s.items || []).forEach((item) => lines.push(`• ${item.text}${item.speaker ? ` (${item.speaker})` : ''}`));
    if (s.speaker) lines.push(`Speaker: ${s.speaker}`);
    if (lines.length) lines.push('');
    lines.push(`Programme: ${SITE_URL}`);
    return lines.join('\n');
  }

  function sessionLocation(s) {
    return [s.room, programme.event.venue].filter(Boolean).join(', ');
  }

  function icsEvent(s, dayIndex, sessionIndex) {
    const day = programme.days[dayIndex];
    return [
      'BEGIN:VEVENT',
      `UID:${day.date}-${dayIndex}-${sessionIndex}-${s.start.replace(':', '')}@orluems2026.com`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(s.startAt)}`,
      `DTEND:${icsDate(s.endAt)}`,
      `SUMMARY:${icsText(s.title)}`,
      `DESCRIPTION:${icsText(sessionDetails(s))}`,
      `LOCATION:${icsText(sessionLocation(s))}`,
      `URL:${SITE_URL}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(s.title)}`,
      `TRIGGER:-PT${REMINDER_MINUTES}M`,
      'END:VALARM',
      'END:VEVENT'
    ];
  }

  function icsCalendar(events) {
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//UEMS-ORL Sofia 2026//Programme//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsText(programme.event.title)}`,
      ...events.flat(),
      'END:VCALENDAR'
    ].map(icsFold).join('\r\n') + '\r\n';
  }

  function downloadIcs(content, filename) {
    // iOS hands a text/calendar data URL straight to the Calendar "Add event"
    // sheet; blob downloads there end up in Files instead.
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(content);
      return;
    }
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function googleCalendarUrl(s) {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: s.title,
      dates: `${icsDate(s.startAt)}/${icsDate(s.endAt)}`,
      details: sessionDetails(s),
      location: sessionLocation(s)
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  }

  function slug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }

  function onCalendarClick(e) {
    const btn = e.target.closest('[data-calendar]');
    if (!btn) return;
    const type = btn.dataset.calendar;
    const dayIndex = Number(btn.dataset.day);
    const sessionIndex = Number(btn.dataset.session);
    const s = programme.days[dayIndex].sessions[sessionIndex];
    if (type === 'google') {
      window.open(googleCalendarUrl(s), '_blank', 'noopener');
    } else {
      downloadIcs(icsCalendar([icsEvent(s, dayIndex, sessionIndex)]), `${slug(s.title)}.ics`);
    }
  }

  /**
   * Live state: mark past / live sessions and open today's tab.
   */
  function updateLiveState(container, selectTab) {
    const key = container.dataset.programme || 'sessions';
    const t = now();

    container.querySelectorAll('.session-block').forEach((block) => {
      const s = programme.days[block.dataset.day][key][block.dataset.session];
      block.classList.toggle('is-live', t >= s.startAt && t < s.endAt);
      block.classList.toggle('is-past', t >= s.endAt);
    });

    if (!selectTab) return;
    const todayIndex = programme.days.findIndex((day) => {
      const list = day[key] || [];
      return list.length && t >= list[0].startAt && t < list[list.length - 1].endAt;
    });
    if (todayIndex > 0 && window.bootstrap) {
      const tab = container.querySelector(`#schedule-${key}-tab-${todayIndex}`);
      if (tab) bootstrap.Tab.getOrCreateInstance(tab).show();
    }
  }

  /**
   * Countdown
   */
  function setCountdown(card, target) {
    const grid = card.querySelector('.countdown');
    if (!target) {
      grid.hidden = true;
      return;
    }
    grid.hidden = false;
    const left = Math.max(0, target.getTime() - now().getTime());
    const parts = {
      days: Math.floor(left / 86400000),
      hours: Math.floor((left % 86400000) / 3600000),
      minutes: Math.floor((left % 3600000) / 60000),
      seconds: Math.floor((left % 60000) / 1000)
    };
    Object.entries(parts).forEach(([unit, value]) => {
      const el = card.querySelector(`.count-${unit}`);
      if (el) el.textContent = value;
    });
  }

  function setText(card, selector, html) {
    const el = card.querySelector(selector);
    if (!el) return;
    el.innerHTML = html || '';
    el.hidden = !html;
  }

  function updateCountdown(card) {
    const t = now();
    const sessions = allSessions();
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    const next = programme.nextEvent || {};
    const nextName = [next.location, next.year].filter(Boolean).join(' ');

    // Before the meeting
    if (t < first.startAt) {
      setText(card, '[data-countdown-title]', 'Countdown to the Meeting');
      setText(card, '[data-countdown-note]', `Starts ${esc(first.start)} · ${esc(programme.days[0].weekday)}, ${esc(programme.days[0].label)}`);
      setText(card, '[data-countdown-message]', '');
      setCountdown(card, first.startAt);
      return;
    }

    // During the meeting
    if (t < last.endAt) {
      const live = sessions.find((s) => t >= s.startAt && t < s.endAt);
      const upcoming = sessions.find((s) => s.startAt > t);
      setText(card, '[data-countdown-title]', upcoming ? 'Happening Now' : 'Enjoy the Evening');
      let note = live ? `<strong>Now:</strong> ${esc(live.title)}` : '';
      if (upcoming) note += `${note ? '<br>' : ''}<strong>Next at ${esc(upcoming.start)}:</strong> ${esc(upcoming.title)}`;
      setText(card, '[data-countdown-note]', note);
      setText(card, '[data-countdown-message]', '');
      setCountdown(card, upcoming ? upcoming.startAt : null);
      return;
    }

    // After the meeting
    const nextStart = next.start ? new Date(next.start) : null;
    if (nextStart && t < nextStart) {
      setText(card, '[data-countdown-title]', `Countdown to ${esc(next.title || nextName)}`);
      setText(card, '[data-countdown-note]', 'Thank you for joining us in Sofia!');
      setText(card, '[data-countdown-message]', '');
      setCountdown(card, nextStart);
      return;
    }

    setText(card, '[data-countdown-title]', 'Thank You, Sofia!');
    setText(card, '[data-countdown-note]', '');
    setText(card, '[data-countdown-message]',
      `<i class="bi bi-airplane"></i>See you at the next meeting${nextName ? ` in <strong>${esc(nextName)}</strong>` : ''}!`);
    setCountdown(card, null);
  }

  /**
   * "Now" bar on the programme page
   */
  function formatIn(target) {
    const mins = Math.max(1, Math.ceil((target - now()) / 60000));
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    return [d && `${d}d`, h && `${h}h`, (!d && m) && `${m}m`].filter(Boolean).join(' ');
  }

  function jumpTo(session) {
    const key = 'sessions';
    const dayIndex = programme.days.findIndex((day) => day[key].includes(session));
    const sessionIndex = programme.days[dayIndex][key].indexOf(session);
    const tab = document.querySelector(`#schedule-${key}-tab-${dayIndex}`);
    if (tab && window.bootstrap) bootstrap.Tab.getOrCreateInstance(tab).show();
    const block = document.querySelector(`[data-programme="${key}"] .session-block[data-day="${dayIndex}"][data-session="${sessionIndex}"]`);
    if (!block) return;
    setTimeout(() => {
      // Centre the session, but never tuck its top under the fixed header.
      const header = document.querySelector('#header');
      const minTop = (header ? header.offsetHeight : 0) + 24;
      const rect = block.getBoundingClientRect();
      const offset = Math.max(minTop, (window.innerHeight - rect.height) / 2);
      window.scrollTo({ top: rect.top + window.scrollY - offset, behavior: 'smooth' });
    }, 200);
  }

  function updateNowBar(bar) {
    const t = now();
    const sessions = allSessions();
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    const next = programme.nextEvent || {};
    const nextName = [next.location, next.year].filter(Boolean).join(' ');
    const live = sessions.find((s) => t >= s.startAt && t < s.endAt);
    const upcoming = sessions.find((s) => s.startAt > t);

    let html;
    if (t < first.startAt) {
      html = `<div class="now-row"><span class="now-label"><i class="bi bi-hourglass-split"></i> Starts in <span class="now-time">${formatIn(first.startAt)}</span></span>
        <span class="now-title">${esc(programme.days[0].weekday)}, ${esc(programme.days[0].label)} at ${esc(first.start)} &ndash; ${esc(first.title)}</span></div>`;
    } else if (t < last.endAt) {
      html = '';
      if (live) {
        html += `<div class="now-row"><span class="now-label live"><i class="bi bi-broadcast"></i> Live now</span>
          <span class="now-title">${esc(live.title)}${live.room ? ` <small>&middot; ${esc(live.room)}</small>` : ''}</span>
          <button type="button" class="now-jump" data-jump="live">View <i class="bi bi-arrow-down-short"></i></button></div>`;
      }
      if (upcoming) {
        html += `<div class="now-row"><span class="now-label"><i class="bi bi-clock"></i> Next at ${esc(upcoming.start)}</span>
          <span class="now-title">${esc(upcoming.title)} <small>&middot; in ${formatIn(upcoming.startAt)}</small></span>
          ${live ? '' : '<button type="button" class="now-jump" data-jump="next">View <i class="bi bi-arrow-down-short"></i></button>'}</div>`;
      }
    } else {
      html = `<div class="now-row"><span class="now-label"><i class="bi bi-airplane"></i> Thank you, Sofia!</span>
        <span class="now-title">See you at the next meeting${nextName ? ` in <strong>${esc(nextName)}</strong>` : ''}!</span></div>`;
    }

    bar.innerHTML = html;
    bar.hidden = !html;
    bar.querySelectorAll('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => jumpTo(btn.dataset.jump === 'live' ? live : upcoming));
    });
  }

  // On the full programme page, bring the live (or next) session into view
  // while the meeting is running. Skipped when the URL targets an anchor.
  function scrollToCurrent() {
    if (!document.querySelector('[data-programme="sessions"]') || location.hash) return;
    const t = now();
    const sessions = allSessions();
    if (t < sessions[0].startAt || t >= sessions[sessions.length - 1].endAt) return;
    const target = sessions.find((s) => t >= s.startAt && t < s.endAt) || sessions.find((s) => s.startAt > t);
    if (target) jumpTo(target);
  }

  /**
   * Init
   */
  function init() {
    const containers = document.querySelectorAll('[data-programme]');
    const cards = document.querySelectorAll('[data-countdown]');
    const bars = document.querySelectorAll('[data-programme-now]');
    if (!containers.length && !cards.length && !bars.length) return;

    const simulated = new URLSearchParams(location.search).get('now');

    fetch(DATA_URL)
      .then((res) => res.json())
      .then((data) => {
        programme = data;
        if (simulated) {
          nowOffset = new Date(simulated + ':00' + programme.event.timezone).getTime() - Date.now();
        }
        prepare();

        containers.forEach((c) => {
          renderProgramme(c);
          c.addEventListener('click', onCalendarClick);
          c.addEventListener('click', onSelectClick);
          updateLiveState(c, true);
        });
        cards.forEach(updateCountdown);
        bars.forEach(updateNowBar);
        scrollToCurrent();

        setInterval(() => {
          containers.forEach((c) => updateLiveState(c, false));
          bars.forEach(updateNowBar);
        }, 30000);
        setInterval(() => cards.forEach(updateCountdown), 1000);
      })
      .catch((err) => console.error('Could not load programme', err));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
