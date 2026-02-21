(function() {
  // Полифилл для Firefox
  if (typeof browser === 'undefined') {
    var browser = chrome;
  }

  const DEFAULT_CFG = {
    host: "http://127.0.0.1",
    port: 7541,
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

  // ========================================================================
  // РАБОТА С ХРАНИЛИЩЕМ (Firefox/Chrome совместимо)
  // ========================================================================
  
  function storageGet(key) {
    return new Promise((resolve, reject) => {
      try {
        browser.storage.sync.get(key, (res) => {
          if (browser.runtime.lastError) {
            reject(browser.runtime.lastError);
          } else {
            resolve(res[key]);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve, reject) => {
      try {
        browser.storage.sync.set(obj, () => {
          if (browser.runtime.lastError) {
            reject(browser.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // ========================================================================
  // ОТПРАВКА СООБЩЕНИЙ В ФОНОВЫЙ СКРИПТ
  // ========================================================================
  
  function sendMessageAsync(message) {
    return new Promise((resolve, reject) => {
      try {
        console.debug('[options] Отправляем сообщение:', message);
        
        // Firefox использует Promise API
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

  // ========================================================================
  // ЗАГРУЗКА И СОХРАНЕНИЕ ПРОФИЛЕЙ
  // ========================================================================
  
  async function loadProfiles() {
    try {
      const profiles = await storageGet('profiles');
      return profiles || [];
    } catch (e) {
      console.error('[options] Ошибка загрузки профилей:', e);
      return [];
    }
  }

async function saveProfiles(profiles) {
  try {
    await storageSet({profiles});
    showStatus('Сохранено ✓', 2000);
    console.debug('[options] Профили сохранены');
    
    // Отправляем сообщение фоновому скрипту для обновления меню
    try {
      const response = await sendMessageAsync({
        type: 'refreshProfiles'
      });
      console.debug('[options] Меню обновлено:', response);
    } catch (e) {
      console.debug('[options] Ошибка при обновлении меню:', e);
    }
  } catch (e) {
    console.error('[options] Ошибка сохранения:', e);
    showStatus('Ошибка сохранения: ' + e.message, 3000, 'error');
  }
}

  // ========================================================================
  // ПОКАЗ СТАТУСА
  // ========================================================================
  
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

  // ========================================================================
  // ПОСТРОЕНИЕ ЭЛЕМЕНТА ПРОФИЛЯ
  // ========================================================================
  
  function buildProfileElement(profile, profiles) {
    const el = createEl('div', {class: 'profile'});

    // Строка с названием и кнопкой удаления
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

    // Текстовое поле с JSON конфигурацией
    const textarea = createEl('textarea');
    textarea.placeholder = DEFAULT_PLACEHOLDER;
    textarea.value = profile.content || DEFAULT_PLACEHOLDER;
    el.appendChild(textarea);

    // Строка с кнопками действий и статусом
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

    // ====================================================================
    // ОБРАБОТЧИК УДАЛЕНИЯ ПРОФИЛЯ
    // ====================================================================
    
    removeBtn.addEventListener('click', async () => {
      const idx = profiles.indexOf(profile);
      if (idx >= 0) {
        const confirmed = confirm(`Удалить профиль "${profile.name}"?`);
        if (confirmed) {
          profiles.splice(idx, 1);
          await saveProfiles(profiles);
          renderProfiles(profiles);
          console.debug('[options] Профиль удалён');
        }
      }
    });

    // ====================================================================
    // ОБРАБОТЧИК ПРОВЕРКИ И СОХРАНЕНИЯ
    // ====================================================================
    
    validateBtn.addEventListener('click', async () => {
      try {
        const parsed = JSON.parse(textarea.value);
        
        // Установка значений по умолчанию
        if (!parsed.host) parsed.host = DEFAULT_CFG.host;
        if (!parsed.port) parsed.port = DEFAULT_CFG.port;
        if (!parsed.action) parsed.action = DEFAULT_CFG.action;
        if (!Array.isArray(parsed.args)) {
          parsed.args = Array.isArray(parsed.params) ? parsed.params : [];
        }
        if (typeof parsed.token === 'undefined') parsed.token = "";
        
        // Сохранение названия
        profile.name = nameInput.value || profile.name || 'Безымянный профиль';
        
        // Сохранение нормализованного JSON
        profile.content = JSON.stringify(parsed, null, 2);
        await saveProfiles(profiles);
        
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

    // ====================================================================
    // ОБРАБОТЧИК ТЕСТА
    // ====================================================================
    
    testBtn.addEventListener('click', async () => {
      try {
        const parsed = JSON.parse(textarea.value);
        
        // Запрос URL для теста
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

        // Отправка сообщения на фоновый скрипт
        const msg = {
          type: 'sendToNative',
          profileId: profile.id,
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

  // ========================================================================
  // ОТРИСОВКА ВСЕХ ПРОФИЛЕЙ
  // ========================================================================
  
  function renderProfiles(profiles) {
    const wrapper = $('#profiles-wrapper');
    wrapper.innerHTML = '';
    
    if (profiles.length === 0) {
      const empty = createEl('div', {class: 'hint'});
      empty.textContent = 'Профилей нет. Нажмите "Добавить профиль" для создания.';
      wrapper.appendChild(empty);
      return;
    }
    
    profiles.forEach(p => {
      wrapper.appendChild(buildProfileElement(p, profiles));
    });
    console.debug('[options] Отрисовано профилей:', profiles.length);
  }

  // ========================================================================
  // ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
  // ========================================================================
  
  async function init() {
    console.debug('[options] Инициализация страницы опций');
    
    const addBtn = $('#add');
    let profiles = await loadProfiles();
    
    // Убедимся, что у всех профилей есть ID
    profiles = profiles.map(p => ({ 
      id: p.id || cryptoRandomId(), 
      name: p.name || 'Безымянный профиль', 
      content: p.content || DEFAULT_PLACEHOLDER 
    }));
    
    await saveProfiles(profiles);
    renderProfiles(profiles);

    // Обработчик кнопки "Добавить профиль"
    addBtn.addEventListener('click', async () => {
      const newProfile = {
        id: cryptoRandomId(),
        name: 'Новый профиль',
        content: DEFAULT_PLACEHOLDER
      };
      profiles.push(newProfile);
      await saveProfiles(profiles);
      renderProfiles(profiles);
      console.debug('[options] Добавлен новый профиль');
      
      // Прокрутка к новому профилю
      setTimeout(() => {
        const wrapper = $('#profiles-wrapper');
        wrapper.lastChild?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    // Слушатель изменений хранилища (синхронизация между вкладками)
    browser.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'sync') return;
      if (changes.profiles) {
        profiles = changes.profiles.newValue || [];
        renderProfiles(profiles);
        console.debug('[options] Профили обновлены с другой вкладки');
      }
    });

    console.debug('[options] Инициализация завершена');
  }

  // ========================================================================
  // ГЕНЕРАЦИЯ СЛУЧАЙНОГО ID
  // ========================================================================
  
  function cryptoRandomId() {
    return 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  // Запуск инициализации когда DOM готов
  document.addEventListener('DOMContentLoaded', init);
})();
