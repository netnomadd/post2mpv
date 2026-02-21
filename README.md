# post2mpv

Расширение браузера + нативный мост для отправки URL в mpv / локальный post2mpv-сервер.

Кратко:
- Расширение: файлы в репозитории (manifest.json, post2mpv.js, popup.html и т.д.).
- Нативный мост: `post2mpv-bridge.go` — читает сообщения native messaging и делает POST на локальный HTTP-сервер (по умолчанию порт 7531).

Важно: по умолчанию мост отправляет заголовок `X-POST2MPV-TOKEN` если задан token в профиле.

---

## Требования

- Go (для сборки моста)
- Браузер (Firefox / Chrome / Chromium)
- Для упаковки XPI: `web-ext` (опционально)

---

## Сборка нативного моста

Пример локальной установки в домашнюю папку (не требует root):

```sh
# собрать бинарник в ~/.local/bin
go build -o "$HOME/.local/bin/post2mpv-bridge" post2mpv-bridge.go
chmod +x "$HOME/.local/bin/post2mpv-bridge"
```

### Генерация манифеста для Firefox

Мост поддерживает флаг `--manifest`, который печатает JSON-манифест в stdout.

```sh
mkdir -p "$HOME/.mozilla/native-messaging-hosts"
$HOME/.local/bin/post2mpv-bridge --manifest > "$HOME/.mozilla/native-messaging-hosts/post2mpv.json"
chmod 644 "$HOME/.mozilla/native-messaging-hosts/post2mpv.json"
```

После создания манифеста перезапустите Firefox.

### Пример манифеста для Chrome/Chromium

Создайте файл (пример для Google Chrome): `~/.config/google-chrome/NativeMessagingHosts/post2mpv.json`

```json
{
  "name": "post2mpv",
  "description": "post2mpv native bridge (post2mpv-bridge)",
  "path": "/home/youruser/.local/bin/post2mpv-bridge",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<EXTENSION_ID>/"
  ]
}
```

Замените `"/home/youruser/.local/bin/post2mpv-bridge"` на абсолютный путь к бинарнику и ` <EXTENSION_ID>` на ID расширения (см. chrome://extensions в режиме разработчика). Перезапустите браузер.

---

## Сборка и установка расширения

### Для разработки

- Firefox: about:debugging → Load Temporary Add-on → укажите `manifest.json` или папку.
- Chrome/Chromium: chrome://extensions → Developer mode → Load unpacked → укажите папку проекта.

### Для публикации / дистрибуции

- Firefox XPI: используйте `web-ext`:

```sh
npm install -g web-ext
web-ext build --source-dir . --artifacts-dir dist
```

- Chrome: для проверки используйте Load unpacked; для публикации сформируйте ZIP и загрузите в Chrome Web Store.

---

## Как это работает

- Расширение формирует объект сообщения и вызывает `browser.runtime.sendNativeMessage('post2mpv', message)`.
- Мост читает length-prefixed JSON из stdin и делает HTTP POST на `host:port/` с телом `{ "url": ..., "action": ..., "params": [...] }`.
- По умолчанию мост использует порт `7531` (и расширение также настроено на 7531 в коде текущей ветки).

Поле `token` в сообщении мост передаёт как заголовок `X-POST2MPV-TOKEN`.

---

## Пример профиля

Профили хранятся в `browser.storage` и могут быть двух типов: массив аргументов или строка с JSON. Пример содержания профиля (строка JSON):

```json
{
  "host": "http://127.0.0.1",
  "port": 7531,
  "token": "",
  "args": ["--ytdl-format=best"]
}
```

---

## Полезные команды

- Печать манифеста:
  - `~/.local/bin/post2mpv-bridge --manifest`
- Помощь:
  - `~/.local/bin/post2mpv-bridge --help`

---

## Отладка и FAQ

- Ошибка «native host not found»: проверьте, что манифест создан в правильной директории и `path` указывает на существующий исполняемый файл.
- Ничего не происходит при отправке URL: проверьте, что локальный post2mpv-сервер запущен и слушает порт (по умолчанию 7531), и что мост может подключиться к этому порту.
- Проверьте права: обычно манифесту достаточно прав 644, бинарнику — исполняемых прав.

---

