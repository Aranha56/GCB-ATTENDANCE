# GCB Estonia — Training Attendance

Полный статический веб‑интерфейс для GitHub Pages. Никакой сборщик не нужен.

## Что уже работает

- календарь по месяцам и выбор конкретной даты;
- выбор группы;
- отметка каждого ученика: присутствовал / отсутствовал;
- статистика в формате `5/10 · 50%`;
- создание, переименование и удаление групп;
- просмотр учеников внутри группы;
- добавление ребёнка;
- редактирование ребёнка;
- удаление ребёнка и его истории посещений;
- перевод ребёнка в другую группу;
- профиль ребёнка, телефон, заметки, история посещений;
- экспорт / импорт резервной копии JSON;
- PWA/service worker;
- адаптация под iPhone, iPad и компьютер;
- локальное сохранение в браузере сразу после запуска;
- готовая интеграция Firebase для общей базы данных и синхронизации телефон ↔ компьютер.

## Как загрузить на GitHub Pages

1. Создайте новый repository на GitHub.
2. Распакуйте ZIP.
3. Загрузите **содержимое папки** в корень repository (`index.html`, `styles.css`, `app.js` и остальные файлы).
4. Откройте **Settings → Pages**.
5. В **Build and deployment** выберите **Deploy from a branch**.
6. Branch: `main`, folder: `/ (root)` → Save.
7. Через минуту GitHub даст ссылку вида `https://username.github.io/repository/`.

## Как включить одну общую базу на телефоне и компьютере

GitHub Pages хранит только сам сайт. Для общей базы данных нужен backend. В этом ZIP уже подготовлена интеграция Firebase.

1. Откройте Firebase Console и создайте проект.
2. **Authentication → Sign-in method → Email/Password → Enable**.
3. **Firestore Database → Create database**.
4. **Project settings → Your apps → Web app** и скопируйте `firebaseConfig`.
5. Откройте `firebase-config.js` и вставьте значения. Поставьте `enabled: true`.
6. В Firestore → Rules вставьте содержимое `FIRESTORE_RULES.txt` и нажмите Publish.
7. Загрузите обновлённый `firebase-config.js` в GitHub.
8. Откройте один и тот же GitHub Pages link на iPhone и MacBook, зарегистрируйте один аккаунт и войдите под ним на обоих устройствах.

После этого изменения будут храниться в Firestore и синхронизироваться между устройствами практически сразу.

## Важно

`firebaseConfig` не является паролем. Защита данных обеспечивается Firebase Authentication + правилами Firestore из `FIRESTORE_RULES.txt`.

Файл `design-reference.png` внутри ZIP — визуальный референс утверждённого интерфейса.


## Logo fix
The GCB logo is embedded directly in `index.html` so it remains visible on GitHub Pages even if asset paths are handled differently. The original `assets/GCB.png` is also kept.
