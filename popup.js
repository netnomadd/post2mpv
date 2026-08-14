// Полифилл для Firefox
if (typeof browser === 'undefined') {
  var browser = chrome;
}

async function getProfiles() {
  const resp = await browser.runtime.sendMessage({ type: 'getProfiles' });
  if (!resp || resp.status !== 'ok') {
    const msg = (resp && (resp.message || resp.detail)) || 'не удалось загрузить профили';
    throw new Error(msg);
  }
  return resp.profiles || [];
}

async function getCurrentTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function init() {
  const profilesList = document.getElementById('profiles-list');
  const settingsBtn = document.getElementById('settings');

  settingsBtn.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  try {
    const profiles = await getProfiles();
    const currentTab = await getCurrentTab();

    if (profiles.length === 0) {
      profilesList.innerHTML = '<div class="info">❌ Профилей не создано<br><br>Нажмите "Настройки" для создания первого профиля</div>';
      return;
    }

    profilesList.innerHTML = '';

    profiles.forEach((profile) => {
      const btn = document.createElement('button');
      btn.className = 'profile-btn';
      btn.textContent = profile.name;
      btn.title = `Хост: ${profile.host || 'localhost'}`;

      btn.addEventListener('click', async () => {
        console.debug('[popup] Выбран профиль:', profile.name);

        browser.runtime.sendMessage({
          type: 'playWithProfile',
          profileId: profile.id,
          url: currentTab.url,
          tabId: currentTab.id
        }).then((response) => {
          console.debug('[popup] Ответ:', response);
          window.close();
        }).catch((error) => {
          console.error('[popup] Ошибка:', error);
          alert('Ошибка: ' + error.message);
        });
      });

      profilesList.appendChild(btn);
    });

  } catch (e) {
    console.error('[popup] Ошибка инициализации:', e);
    profilesList.innerHTML = '<div class="info">❌ Ошибка загрузки профилей<br><br>' +
      e.message + '</div>';
  }
}

document.addEventListener('DOMContentLoaded', init);
