// Полифилл для совместимости
if (typeof browser === 'undefined') {
  var browser = chrome;
}

const contexts = ["link", "image", "video", "audio", "selection", "frame"];
const CREATE_PROFILE = "createProfile";
const UPDATE_PROFILE = "updateProfile";
const DELETE_PROFILE = "deleteProfile";
const PROFILES = "profiles";
const OPEN_VIDEO = "openVideo";
const TITLE = "Play in MPV";

// Имя native host (должно совпадать с зарегистрированным манифестом)
const NATIVE_HOST_NAME = "post2mpv";

function onError(error) {
  console.error("[post2mpv]", error);
}

// Вспомогательные функции для работы с хранилищем
function storageGet(key) {
  return new Promise((resolve) => {
    browser.storage.sync.get(key, (res) => {
      resolve(res[key]);
    });
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    browser.storage.sync.set(obj, () => resolve());
  });
}

async function getProfiles() {
  try {
    return (await storageGet(PROFILES)) || [];
  } catch (error) {
    console.debug("Не удалось получить профили:", error);
    return [];
  }
}

async function getProfileById(id) {
  try {
    const profiles = await getProfiles();
    return profiles.find((pf) => pf.id === id) || null;
  } catch (e) {
    console.debug("Ошибка getProfileById:", e);
    return null;
  }
}

// sendNative: обёртка для browser.runtime.sendNativeMessage -> Promise
function sendNative(message, timeout = 15000) {
  return new Promise((resolve, reject) => {
    try {
      let done = false;
      
      browser.runtime.sendNativeMessage(NATIVE_HOST_NAME, message).then(
        (response) => {
          done = true;
          console.debug('[post2mpv] Ответ от native host:', response);
          resolve(response);
        },
        (error) => {
          done = true;
          console.error('[post2mpv] Ошибка native host:', error);
          reject(error);
        }
      );

      // Резервный таймаут
      setTimeout(() => {
        if (!done) reject(new Error('истёк таймаут native messaging'));
      }, timeout);
    } catch (e) {
      console.error('[post2mpv] Исключение sendNative:', e);
      reject(e);
    }
  });
}

/**
 * Собрать и отправить подходящее native сообщение на основе профиля и действия.
 */
async function post2mpv(url, tabId, profileOrOptions) {
  if (tabId != null) {
    try {
      browser.scripting?.executeScript?.({
        target: { tabId: tabId, allFrames: true },
        func: () => {
          document.querySelectorAll("video").forEach((video) => video.pause());
        },
      }).catch(() => {
        // игнорируем, если scripting недоступен
      });
    } catch (e) {
      console.debug('[post2mpv] Ошибка scripting:', e);
    }
  }

  try {
    let host = "http://127.0.0.1";
    let port = 7531;
    let action = "play";
    let params = [];
    let token = "";

    if (Array.isArray(profileOrOptions)) {
      // старый формат: массив опций -> используем как параметры
      params = profileOrOptions;
    } else if (typeof profileOrOptions === 'string') {
      const profile = await getProfileById(profileOrOptions);
      if (profile) {
        if (Array.isArray(profile.content)) {
          params = profile.content.filter(line => !!line);
        } else if (typeof profile.content === 'string') {
          try {
            const parsed = JSON.parse(profile.content);
            host = parsed.host || host;
            port = parsed.port || port;
            action = parsed.action || action;
            params = Array.isArray(parsed.args) ? parsed.args : (Array.isArray(parsed.params) ? parsed.params : []);
            token = parsed.token || "";
          } catch (e) {
            console.debug('[post2mpv] Не удалось разобрать содержимое профиля, используем как параметры');
            // резервный вариант: разделить на строки
            params = profile.content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          }
        }
      }
    }

    // Собрать native сообщение
    const message = {
      type: action,
      url,
      host,
      port,
      action,
      params,
      token
    };

    console.debug('[post2mpv] Отправляем на native host:', message);
    const resp = await sendNative(message);
    console.debug('[post2mpv] Ответ:', resp);
    return resp;
  } catch (e) {
    console.error('[post2mpv] Ошибка post2mpv():', e);
    onError(e);
    throw e;
  }
}

async function getOptions(id) {
  try {
    const profile = await getProfileById(id);
    if (!profile) return [];
    if (Array.isArray(profile.content)) {
      return profile.content.filter((line) => !!line);
    }
    if (typeof profile.content === 'string') {
      try {
        const parsed = JSON.parse(profile.content);
        return Array.isArray(parsed.args) ? parsed.args : (Array.isArray(parsed.params) ? parsed.params : []);
      } catch (e) {
        return profile.content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      }
    }
    return [];
  } catch (error) {
    console.debug("Не удалось получить опции для профиля:", id, error);
    return [];
  }
}

async function submenuClicked(info, tab) {
  console.debug('[post2mpv] Клик по подменю:', info.menuItemId);
  
  if (info.parentMenuItemId === "post2mpv" || info.menuItemId === "post2mpv") {
    const url = info.linkUrl || info.srcUrl || info.selectionText || info.frameUrl;
    if (url) {
      const tabId = tab ? tab.id : null;
      try {
        await post2mpv(url, tabId, info.menuItemId);
      } catch (e) {
        console.error('[post2mpv] Ошибка в submenuClicked:', e);
        onError(e);
      }
    }
  }
}

function createContextMenuPromise(properties) {
  return new Promise((resolve, reject) => {
    browser.menus.create(properties, () => {
      if (browser.runtime.lastError) {
        console.error('[post2mpv] Ошибка создания меню:', browser.runtime.lastError);
        return reject(browser.runtime.lastError);
      }
      resolve();
    });
  });
}

async function changeToMultiEntries() {
  try {
    await browser.menus.removeAll();

    await createContextMenuPromise({
      id: "post2mpv",
      title: "Профили",
      contexts,
    });

    await createContextMenuPromise({
      parentId: "post2mpv",
      id: "22941114-4db3-4296-8fc2-49f178843f52",
      title: TITLE,
      contexts,
    });
  } catch (e) {
    console.error('[post2mpv] Ошибка changeToMultiEntries:', e);
  }
}

async function changeToSingleEntry() {
  try {
    await browser.menus.removeAll();

    await createContextMenuPromise({
      id: "post2mpv",
      title: TITLE,
      contexts,
    });
  } catch (e) {
    console.error('[post2mpv] Ошибка changeToSingleEntry:', e);
  }
}

async function createContextMenusFromProfiles(profiles) {
  for (const profile of profiles) {
    try {
      await createContextMenuPromise({
        parentId: "post2mpv",
        id: profile.id,
        title: profile.name,
        contexts,
      });
    } catch (e) {
      console.error('[post2mpv] Ошибка создания меню для профиля:', profile.id, e);
    }
  }
}

async function refreshProfiles() {
  try {
    const profiles = await getProfiles();

    if (profiles.length === 0) {
      await changeToSingleEntry();
    } else {
      await changeToMultiEntries();
      await createContextMenusFromProfiles(profiles)
    }
  } catch (e) {
    console.error('[post2mpv] Ошибка refreshProfiles:', e);
  }
}

async function deleteProfile(menuItemId) {
  try {
    await browser.menus.remove(menuItemId);

    const profiles = (await getProfiles()).filter((pf) => pf.id !== menuItemId);

    if (profiles.length === 0) {
      await changeToSingleEntry();
    }
  } catch (e) {
    console.error('[post2mpv] Ошибка deleteProfile:', e);
  }
}

async function updateProfile(profile) {
  try {
    await browser.menus.update(profile.id, {
      title: profile.name,
    });
  } catch (e) {
    console.error('[post2mpv] Ошибка updateProfile:', e);
  }
}

// ============================================================================
// ОБРАБОТЧИК СООБЩЕНИЙ
// ============================================================================
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.debug('[post2mpv] Сообщение получено:', request);
  
  if (!request) {
    sendResponse({ status: 'failure', detail: 'нет запроса' });
    return true;
  }

  (async () => {
    try {
      // Обновление меню при изменении профилей
      if (request.type === 'refreshProfiles') {
        console.debug('[post2mpv] Получено сообщение refreshProfiles');
        try {
          await refreshProfiles();
          sendResponse({ status: 'ok' });
        } catch (e) {
          console.error('[post2mpv] Ошибка при обновлении меню:', e);
          sendResponse({ status: 'error', detail: String(e) });
        }
        return;
      }

      // Обработка выбора профиля из popup
      if (request.type === 'playWithProfile') {
        const { profileId, url, tabId } = request;
        console.debug('[post2mpv] Получено playWithProfile:', profileId);
        
        try {
          await post2mpv(url, tabId, profileId);
          sendResponse({ status: 'ok' });
        } catch (e) {
          console.error('[post2mpv] Ошибка при воспроизведении:', e);
          sendResponse({ status: 'error', detail: String(e) });
        }
        return;
      }

      // Обработка sendToNative из options.js (тест профиля)
      if (request.type === 'sendToNative') {
        const { profileId, payload } = request;
        const profile = profileId ? await getProfileById(profileId) : null;
        let host = "http://127.0.0.1";
        let port = 7531;
        let token = "";
        let params = [];
        
        if (profile) {
          if (typeof profile.content === 'string') {
            try {
              const parsed = JSON.parse(profile.content);
              host = parsed.host || host;
              port = parsed.port || port;
              token = parsed.token || "";
              params = Array.isArray(parsed.args) ? parsed.args : (Array.isArray(parsed.params) ? parsed.params : []);
            } catch (e) {
              console.debug('[post2mpv] Не удалось разобрать содержимое профиля:', e);
            }
          }
        } else if (request.profile) {
          const parsed = request.profile;
          host = parsed.host || host;
          port = parsed.port || port;
          token = parsed.token || "";
          params = Array.isArray(parsed.args) ? parsed.args : (Array.isArray(parsed.params) ? parsed.params : []);
        }

        const msg = {
          type: payload.action || 'play',
          url: payload.url,
          host,
          port,
          action: payload.action || 'play',
          params: payload.params || params,
          token
        };

        console.debug('[post2mpv] Отправляем тестовое сообщение:', msg);
        try {
          const resp = await sendNative(msg);
          console.debug('[post2mpv] Ответ теста:', resp);
          sendResponse({ status: 'ok', detail: resp });
        } catch (e) {
          console.error('[post2mpv] Ошибка native messaging:', e);
          sendResponse({ status: 'error', detail: String(e) });
        }
        return;
      }

      // Обработка других типов сообщений (управление профилями)
      const { type, profile } = request;
      switch (type) {
        case CREATE_PROFILE: 
          await refreshProfiles();
          sendResponse({ status: 'ok' });
          return;
        case UPDATE_PROFILE: 
          await updateProfile(profile);
          sendResponse({ status: 'ok' });
          return;
        case DELETE_PROFILE: 
          await deleteProfile(profile.id);
          sendResponse({ status: 'ok' });
          return;
        default: 
          sendResponse({ status: 'failure', detail: 'неизвестный тип' });
          return;
      }
    } catch (err) {
      console.error('[post2mpv] Ошибка в обработчике сообщений:', err);
      sendResponse({ status: 'error', detail: String(err) });
    }
  })();

  return true;
});

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================
browser.runtime.onInstalled.addListener(async (_) => {
  console.debug('[post2mpv] Расширение установлено/обновлено');
  const profiles = await getProfiles();

  if (profiles.length === 0) {
    await changeToSingleEntry();
  } else {
    await changeToMultiEntries();
    await createContextMenusFromProfiles(profiles)
  }
});

// ============================================================================
// ОБРАБОТЧИК КЛИКА ПО МЕНЮ
// ============================================================================
browser.menus.onClicked.addListener(submenuClicked);

console.debug('[post2mpv] Фоновый скрипт загружен');
