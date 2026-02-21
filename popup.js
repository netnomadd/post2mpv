// Полифилл для Firefox
if (typeof browser === 'undefined') {
  var browser = chrome;
}

async function getProfiles() {
  return new Promise((resolve) => {
    browser.storage.sync.get('profiles', (res) => {
      resolve(res['profiles'] || []);
    });
  });
}

async function getCurrentTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function init() {
  const profilesList = document.getElementById('profiles-list');
  const settingsBtn = document.getElementById('settings');
  
  try {
    const profiles = await getProfiles();
    const currentTab = await getCurrentTab();
    
    if (profiles.length === 0) {
      profilesList.innerHTML = '<div class="info">❌ Профилей не создано<br><br>Нажмите "Настройки" для создания первого профиля</div>';
      return;
    }
    
    // Очистить loading
    profilesList.innerHTML = '';
    
    // Добавить кнопки профилей
    profiles.forEach((profile) => {
      const btn = document.createElement('button');
      btn.className = 'profile-btn';
      btn.textContent = profile.name;
      btn.title = `Хост: ${profile.content ? JSON.parse(profile.content).host : 'localhost'}`;
      
      btn.addEventListener('click', async () => {
        console.debug('[popup] Выбран профиль:', profile.name);
        
        // Отправляем сообщение фоновому скрипту
        browser.runtime.sendMessage({
          type: 'playWithProfile',
          profileId: profile.id,
          url: currentTab.url,
          tabId: currentTab.id
        }).then((response) => {
          console.debug('[popup] Ответ:', response);
          // Закрыть popup после отправки
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
    profilesList.innerHTML = '<div class="info">❌ Ошибка загрузки профилей</div>';
  }
  
  // Обработчик кнопки настроек
  settingsBtn.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', init);
