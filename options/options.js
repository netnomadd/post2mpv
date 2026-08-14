(function() {
  // Полифилл для Firefox
  if (typeof browser === 'undefined') {
    var browser = chrome;
  }

  const DEFAULT_CFG = {
    host: "http://127.0.0.1",
    port: 7531,
    action: "play",
    args: ["--no-terminal"],
    token: ""
  };
  const DEFAULT_PLACEHOLDER = JSON.stringify(DEFAULT_CFG, null, 2);

  function $(sel, root = document) { return root.querySelector(sel); }

  function createEl(tag, attrs = {}, text) {
    const el = document.createElement(tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (text) el.textContent = text;
    return el;
  }

  function sendMessageAsync(message) {
    return new Promise((resolve, reject) => {
      try {
        console.debug('[options] Отправляем сообщение:', message);

        if (browser && browser.runtime && browser.runtime.sendMessage) {
          browser.runtime.sendMessage(message).then(
            (response) => {
              console.debug('[options] Ответ получен:', response);
              resolve(response);
            },
            (error) => {
              console.error('[options] Ошибка при отправке:', error);
              reject(error);
            }
          );
        } else {
          reject(new Error('Runtime API недоступен'));
        }
      } catch (e) {
        console.error('[options] Исключение sendMessageAsync:', e);
        reject(e);
      }
    });
  }

  function contentFromStored(profile) {
    return JSON.stringify({
      host: profile.host || DEFAULT_CFG.host,
      port: profile.port || DEFAULT_CFG.port,
      action: profile.action || DEFAULT_CFG.action,
      args: Array.isArray(profile.args) ? profile.args : (Array.isArray(profile.params) ? profile.params : DEFAULT_CFG.args),
      token: typeof profile.token === 'undefined' ? "" : profile.token
    }, null, 2);
  }

  function toUiProfile(profile) {
    if (typeof profile.content === 'string') {
      return {
        id: profile.id || cryptoRandomId(),
        name: profile.name || 'Безымянный профиль',
        content: profile.content
      };
    }
    return {
      id: profile.id || cryptoRandomId(),
      name: profile.name || 'Безымянный профиль',
      content: contentFromStored(profile)
    };
  }

  function toStoredProfile(profile) {
    const parsed = JSON.parse(profile.content);
    if (!parsed.host) parsed.host = DEFAULT_CFG.host;
    if (!parsed.port) parsed.port = DEFAULT_CFG.port;
    if (!parsed.action) parsed.action = DEFAULT_CFG.action;
    if (!Array.isArray(parsed.args)) {
      parsed.args = Array.isArray(parsed.params) ? parsed.params : [];
    }
    if (typeof parsed.token === 'undefined') parsed.token = "";
    return {
      id: profile.id,
      name: profile.name || 'Безымянный профиль',
      host: parsed.host,
      port: parsed.port,
      action: parsed.action,
      args: parsed.args,
      token: parsed.token
    };
  }

  async function loadProfiles() {
    const resp = await sendMessageAsync({ type: 'getProfiles' });
    return resp;
  }

  async function saveProfiles(uiProfiles) {
    try {
      const stored = uiProfiles.map(toStoredProfile);
      const resp = await sendMessageAsync({
        type: 'saveProfiles',
        profiles: stored
      });
      if (!resp || resp.status !== 'ok') {
        const msg = (resp && (resp.message || resp.detail)) || 'неизвестная ошибка';
        showStatus('Ошибка сохранения: ' + msg, 4000, 'error');
        return false;
      }
      showStatus('Сохранено ✓', 2000);
      console.debug('[options] Профили сохранены', resp.path);
      return true;
    } catch (e) {
      console.error('[options] Ошибка сохранения:', e);
      showStatus('Ошибка сохранения: ' + e.message, 3000, 'error');
      return false;
    }
  }

  function showStatus(msg, timeout = 2000, type = 'success') {
    const st = $('#status');
    st.textContent = msg;
    st.className = 'status';
    if (type) {
      st.classList.add(type);
    }
    console.debug('[options] Статус:', msg);
    if (timeout) {
      setTimeout(() => {
        st.textContent = '';
        st.className = 'status';
      }, timeout);
    }
  }

  function setConfigPath(path) {
    const el = $('#config-path');
    if (!el || !path) return;
    el.textContent = path;
  }

  function buildProfileElement(profile, profiles) {
    const el = createEl('div', {class: 'profile'});

    const meta = createEl('div', {class: 'meta'});
    const nameInput = createEl('input', {
      type: 'text',
      placeholder: 'Название профиля (например: YouTube - высокое качество)'
    });
    nameInput.value = profile.name || '';
    meta.appendChild(nameInput);

    const removeBtn = createEl('button', {class: 'button remove'}, '✕ Удалить');
    removeBtn.type = 'button';
    meta.appendChild(removeBtn);

    el.appendChild(meta);

    const textarea = createEl('textarea');
    textarea.placeholder = DEFAULT_PLACEHOLDER;
    textarea.value = profile.content || DEFAULT_PLACEHOLDER;
    el.appendChild(textarea);

    const row = createEl('div', {class: 'meta'});

    const validateBtn = createEl('button', {class: 'button validate'}, '✓ Проверить и сохранить');
    validateBtn.type = 'button';
    row.appendChild(validateBtn);

    const testBtn = createEl('button', {class: 'button test'}, '▶ Тест POST');
    testBtn.type = 'button';
    row.appendChild(testBtn);

    const status = createEl('span', {class: 'status'}, '');
    row.appendChild(status);

    el.appendChild(row);

    removeBtn.addEventListener('click', async () => {
      const idx = profiles.indexOf(profile);
      if (idx >= 0) {
        const confirmed = confirm(`Удалить профиль "${profile.name}"?`);
        if (confirmed) {
          profiles.splice(idx, 1);
          const ok = await saveProfiles(profiles);
          if (ok) {
            renderProfiles(profiles);
            console.debug('[options] Профиль удалён');
          }
        }
      }
    });

    validateBtn.addEventListener('click', async () => {
      try {
        const parsed = JSON.parse(textarea.value);

        if (!parsed.host) parsed.host = DEFAULT_CFG.host;
        if (!parsed.port) parsed.port = DEFAULT_CFG.port;
        if (!parsed.action) parsed.action = DEFAULT_CFG.action;
        if (!Array.isArray(parsed.args)) {
          parsed.args = Array.isArray(parsed.params) ? parsed.params : [];
        }
        if (typeof parsed.token === 'undefined') parsed.token = "";

        profile.name = nameInput.value || profile.name || 'Безымянный профиль';
        profile.content = JSON.stringify(parsed, null, 2);
        const ok = await saveProfiles(profiles);
        if (!ok) return;

        status.classList.remove('error');
        status.textContent = '✓ Корректно';
        console.debug('[options] Профиль проверен и сохранён');
        setTimeout(() => status.textContent = '', 2000);
      } catch (e) {
        status.classList.add('error');
        status.textContent = '✗ Ошибка JSON: ' + e.message;
        console.error('[options] Ошибка парсинга JSON:', e);
      }
    });

    testBtn.addEventListener('click', async () => {
      try {
        const parsed = JSON.parse(textarea.value);

        const url = prompt('Введите URL для теста (например: https://www.youtube.com/watch?v=...):');
        if (!url) {
          console.debug('[options] Тест отменён');
          return;
        }

        const payload = {
          url,
          action: parsed.action || 'play',
          params: parsed.args || parsed.params || []
        };

        status.textContent = '⏳ Отправляем...';
        status.classList.remove('error');
        console.debug('[options] Отправляем тестовое сообщение для профиля:', profile.id);

        const msg = {
          type: 'sendToNative',
          profileId: profile.id,
          profile: parsed,
          payload,
          test: true
        };

        try {
          const resp = await sendMessageAsync(msg);
          console.debug('[options] Ответ на тест:', resp);

          if (resp && resp.status === 'ok') {
            status.classList.remove('error');
            status.textContent = '✓ Отправлено на сервер';
          } else if (resp && resp.status === 'error') {
            status.classList.add('error');
            status.textContent = '✗ Ошибка: ' + (resp.detail || resp.message);
          } else {
            status.textContent = '✓ Ответ: ' + JSON.stringify(resp).substring(0, 50) + '...';
          }
        } catch (e) {
          console.error('[options] Ошибка при отправке теста:', e);
          status.classList.add('error');
          status.textContent = '✗ Ошибка: ' + e.message;
        }

        setTimeout(() => status.textContent = '', 5000);
      } catch (e) {
        status.classList.add('error');
        status.textContent = '✗ Ошибка JSON: ' + e.message;
        console.error('[options] Ошибка парсинга JSON при тесте:', e);
      }
    });

    return el;
  }

  function renderProfiles(profiles) {
    const wrapper = $('#profiles-wrapper');
    wrapper.innerHTML = '';

    if (profiles.length === 0) {
      const empty = createEl('div', {class: 'hint'});
      empty.textContent = 'Профилей нет. Нажмите "Добавить профиль" для создания. Файл hosts.json появится при первом сохранении.';
      wrapper.appendChild(empty);
      return;
    }

    profiles.forEach(p => {
      wrapper.appendChild(buildProfileElement(p, profiles));
    });
    console.debug('[options] Отрисовано профилей:', profiles.length);
  }

  function showLoadError(message) {
    const wrapper = $('#profiles-wrapper');
    wrapper.innerHTML = '';
    const empty = createEl('div', {class: 'hint'});
    empty.textContent = 'Не удалось прочитать hosts.json: ' + message +
      ' Исправьте файл и откройте настройки снова — файл не будет перезаписан.';
    wrapper.appendChild(empty);
    const addBtn = $('#add');
    if (addBtn) addBtn.disabled = true;
  }

  async function init() {
    console.debug('[options] Инициализация страницы опций');

    const addBtn = $('#add');
    let profiles = [];

    try {
      const resp = await loadProfiles();
      if (resp && resp.path) setConfigPath(resp.path);

      if (!resp || resp.status !== 'ok') {
        const msg = (resp && (resp.message || resp.detail)) || 'нет ответа от native host';
        showLoadError(msg);
        showStatus(msg, 0, 'error');
        console.error('[options] Ошибка загрузки профилей:', msg);
        return;
      }

      profiles = (resp.profiles || []).map(toUiProfile);
    } catch (e) {
      showLoadError(e.message);
      showStatus('Ошибка загрузки: ' + e.message, 0, 'error');
      return;
    }

    renderProfiles(profiles);

    addBtn.addEventListener('click', async () => {
      const newProfile = {
        id: cryptoRandomId(),
        name: 'Новый профиль',
        content: DEFAULT_PLACEHOLDER
      };
      profiles.push(newProfile);
      const ok = await saveProfiles(profiles);
      if (!ok) {
        profiles.pop();
        return;
      }
      renderProfiles(profiles);
      console.debug('[options] Добавлен новый профиль');

      setTimeout(() => {
        const wrapper = $('#profiles-wrapper');
        wrapper.lastChild?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    console.debug('[options] Инициализация завершена');
  }

  function cryptoRandomId() {
    return 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
