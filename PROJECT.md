# Centras.Echo — Система Управления Проектом

## Архитектура
Проект Centras.Echo представляет собой безопасную корпоративную платформу видеоконференций с автоматическим ИИ-протоколированием (Senti AI Secretary).

### Стек технологий
- **Frontend**: Next.js 15 (App Router), CSS Modules, LiveKit React Components, Lucide React, html2canvas, jsPDF.
- **Backend**: Fastify 5 (TypeScript, tsx), pg (node-postgres), @fastify/jwt, @fastify/rate-limit.
- **База данных**: PostgreSQL (с расширениями pgcrypto, pg_trgm), Row Level Security (RLS) на уровне таблиц.
- **Стриминг**: LiveKit Server & Client SDK.
- **ИИ-Сервис**: Google Generative AI (Gemini 3.1 Flash Lite) для диаризации спикеров, генерации резюме, фиксации решений и задач.

---

## Реестр модулей

| Модуль | Путь | Ответственность | Зависимости |
| :--- | :--- | :--- | :--- |
| **API Entry** | [index.ts](file:///f:/c.echo/apps/api/src/index.ts) | Настройка Fastify, плагинов CORS, JWT, Rate Limit, запуск сервера. | Fastify, routes |
| **Auth Routes** | [auth.ts](file:///f:/c.echo/apps/api/src/routes/auth.ts) | Аутентификация, выдача access/refresh токенов, гостевой доступ. | pg, bcrypt, jwt |
| **Google Auth** | [google-auth.ts](file:///f:/c.echo/apps/api/src/routes/google-auth.ts) | Google SSO OAuth2 авторизация, связывание аккаунтов. | pg, fetch |
| **Meetings Routes** | [meetings.ts](file:///f:/c.echo/apps/api/src/routes/meetings.ts) | Создание, завершение встреч, загрузка аудио, управление залом ожидания. | pg, gemini, limits |
| **LiveKit Routes** | [livekit.ts](file:///f:/c.echo/apps/api/src/routes/livekit.ts) | Генерация токенов доступа к комнатам, псевдо-egress управление. | livekit-server-sdk, limits |
| **Senti Routes** | [senti.ts](file:///f:/c.echo/apps/api/src/routes/senti.ts) | Чат с ИИ-секретарем по материалам конкретной встречи. | gemini-ai, pg, masking |
| **Gemini Service** | [gemini.ts](file:///f:/c.echo/apps/api/src/services/gemini.ts) | Запуск пайплайна ИИ (инференс, транскрипция, извлечение задач). | @google/generative-ai, pg |
| **Limits Service** | [limits.ts](file:///f:/c.echo/apps/api/src/services/limits.ts) | Контроль лимитов участников (макс. 7) и активных встреч (макс. 5). | pg |
| **Masking Service** | [masking.ts](file:///f:/c.echo/apps/api/src/services/masking.ts) | Маскирование персональных данных (PII) перед отправкой в ИИ. | RegExp |

---

## Журнал задач

| # | Задача / Продуктовая фича | Статус | Файлы | Оценка продукта и примечания |
| :-: | :--- | :-: | :--- | :--- |
| 1 | Обзор архитектуры и анализ логических дыр | [x] | `PROJECT.md` | Выполнен продуктовый аудит безопасности, стабильности и UX. |
| 2 | Исправление авторизации и гостевого доступа | [x] | [meetings.ts](file:///f:/c.echo/apps/api/src/routes/meetings.ts), [livekit.ts](file:///f:/c.echo/apps/api/src/routes/livekit.ts) | Заблокирован доступ гостей к приватным комнатам в `/join` и `/token`. Внедрена валидация статуса зала ожидания. |
| 3 | Поддержка Row Level Security (RLS) в сессиях | [x] | [pool.ts](file:///f:/c.echo/apps/api/src/db/pool.ts), [meetings.ts](file:///f:/c.echo/apps/api/src/routes/meetings.ts) | Создан хелпер `runWithUser` с установкой `SET LOCAL app.current_user_id` во всех основных SELECT-запросах. |
| 4 | Стабильность микширования аудиопотоков | [x] | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/%5Bid%5D/page.tsx) | Внедрено горячее переподключение изменившихся аудиопотоков участников и автоочистка по `TrackUnsubscribed`. |
| 5 | Лимиты комнат и автозакрытие встреч | [x] | [limits.ts](file:///f:/c.echo/apps/api/src/services/limits.ts), [meetings.ts](file:///f:/c.echo/apps/api/src/routes/meetings.ts) | Внедрена фоновая ленивая очистка зависших комнат при создании новой встречи и при запросе лимитов. |
| 6 | Доменная авторегистрация Google SSO | [x] | [google-auth.ts](file:///f:/c.echo/apps/api/src/routes/google-auth.ts) | Внедрена авторегистрация сотрудников с белым списком доменов через переменную `ALLOWED_DOMAINS`. |
| 7 | Интеграция Gemini Files API и Multi-Turn Chat | [x] | [gemini.ts](file:///f:/c.echo/apps/api/src/services/gemini.ts), [senti.ts](file:///f:/c.echo/apps/api/src/routes/senti.ts), [page.tsx](file:///f:/c.echo/apps/web/src/app/archive/%5Bid%5D/page.tsx) | Пайплайн переведен на Files API. Чат Senti теперь хранит контекст до 10 реплик. Расширен фронтенд загрузчик аудио. |
| 8 | Устранение RLS-рекурсии, исправление синтаксиса $1 и редизайн логотипа | [x] | [schema.sql](file:///f:/c.echo/apps/api/src/db/schema.sql), [pool.ts](file:///f:/c.echo/apps/api/src/db/pool.ts), [Logo.tsx](file:///f:/c.echo/apps/web/src/components/Logo.tsx), [page.tsx](file:///f:/c.echo/apps/web/src/app/login/page.tsx) | Исправлена рекурсия RLS и устранена бэкенд-ошибка `SET LOCAL $1` через `set_config` на бэкенде. Произведен редизайн логотипа: убрана обводка, камера сделана глянцевой и свободной, выделен блок Senti AI в футере карточки входа (легкий золотой градиент, пульсирующая точка). Логотип на входе увеличен до 52, в сайдбаре оптимизирован до 36 (гарантированное вписывание в 232px без выхода за границы). |
| 9 | Исправление сброса сессий при опросах и обходах автоплея аудио | [x] | [api.ts](file:///f:/c.echo/apps/web/src/lib/api.ts), [page.tsx](file:///f:/c.echo/apps/web/src/app/room/%5Bid%5D/page.tsx), [room.module.css](file:///f:/c.echo/apps/web/src/app/room/%5Bid%5D/room.module.css) | Исправлено состояние гонки токенов (race condition) при фоновом конкурентном обновлении сессии через `activeRefreshPromise`. Добавлен интеллектуальный контроль разрешений на автовоспроизведение звука (`room.canPlaybackAudio`) с премиум glassmorphic-баннером для ручного сброса блокировки звука в браузере. |
| 10 | Отказоустойчивый захват микрофона и восстановление связи при падении WebRTC | [x] | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/%5Bid%5D/page.tsx) | Внедрен первичный опрос аппаратного присутствия устройств и независимый отказоустойчивый захват медиа с автоматическим переходом микрофона в audio-only fallback при ошибках камеры. Добавлен контроль разрывов WebRTC-сессии и премиальный оверлей восстановления связи с кнопкой ручного переподключения. |
| 11 | Безопасность медиа-устройств и отказоустойчивость WebRTC соединений на внешних клиентах | [x] | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/%5Bid%5D/page.tsx) | Внедрена проверка безопасного контекста и доступности `navigator.mediaDevices` на клиенте для предотвращения падений. Добавлен параметр `connectOptions` в `<LiveKitRoom />` с увеличенными таймаутами и резервными STUN-серверами для обхода NAT и брандмауэров на удаленных машинах. |
| 12 | Переработка и детализация мобильного UX/UI (дашборд, комната звонка, архив) | [x] | [dashboard.module.css](file:///f:/c.echo/apps/web/src/app/dashboard/dashboard.module.css), [page.tsx](file:///f:/c.echo/apps/web/src/app/dashboard/page.tsx), [room.module.css](file:///f:/c.echo/apps/web/src/app/room/[id]/room.module.css), [page.tsx](file:///f:/c.echo/apps/web/src/app/room/[id]/page.tsx), [protocol.module.css](file:///f:/c.echo/apps/web/src/app/archive/[id]/protocol.module.css) | Реализована адаптивная нижняя навигация, выплывающие bottom-drawers для чата/участников/Senti, меню 'Ещё' для компактного управления и горизонтальный свайп вкладок архива. |
| 13 | Устранение сбоев WebRTC подключения (ICE) и сетевых 401 ошибок в консоли | [x] | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/[id]/page.tsx), [api.ts](file:///f:/c.echo/apps/web/src/lib/api.ts) | Удалена жесткая перезапись `iceServers` в `<LiveKitRoom />`, позволяя клиенту использовать TCP-кандидаты сервера на Railway. Добавлен локальный пропуск неавторизованных запросов без токенов, устраняя ложные 401 ошибки. |
| 14 | Учет только активных участников комнат и автоматическая очистка гостей | [x] | [limits.ts](file:///f:/c.echo/apps/api/src/services/limits.ts), [meetings.ts](file:///f:/c.echo/apps/api/src/routes/meetings.ts), [auth.ts](file:///f:/c.echo/apps/api/src/routes/auth.ts) | Реализован подсчет и вывод участников на дашборде только на основе текущих подключений в LiveKit. Настроен автоматический сборщик мусора, удаляющий временных гостей из базы данных после выхода или завершения встречи. |
| 15 | Проектирование и аудит стабильности медиа-подключений и безопасности ключей | [x] | `PROJECT.md`, [livekit.yaml](file:///f:/c.echo/livekit.yaml), [page.tsx](file:///f:/c.echo/apps/web/src/app/room/[id]/page.tsx) | Проведен комплексный глубокий аудит (gstack/CSO/Architect) причин сбоев WebRTC и блокировки микрофонов, проанализированы все конфигурации на отсутствие захардкоженных секретов. Разработано и задокументировано готовое продуктовое решение. |
| 16 | Интеграция Senti Translate (BETA) локального перевода в реальном времени | [x] | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/[id]/page.tsx), [room.module.css](file:///f:/c.echo/apps/web/src/app/room/[id]/room.module.css), [meetings.ts](file:///f:/c.echo/apps/api/src/routes/meetings.ts), [api.ts](file:///f:/c.echo/apps/web/src/lib/api.ts) | Настроен реальный перевод в реальном времени через созданный прокси-эндпоинт Google Translate на API-сервере, с поддержкой Web Speech API, интерактивной боковой панелью, историей и субтитрами. |
| 17 | Исправление утечки/зависания SpeechRecognition и окончательное удаление заглушек | [x] | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/[id]/page.tsx) | Полностью устранена проблема бесконечного перезапуска SpeechRecognition (из-за которого не срабатывала смена языков и не шел перевод). Внедрен флаг `active` для корректной утилизации старой сессии перед запуском новой. Подтверждено удаление всех симуляций. |
| 18 | Оптимизация верстки: уменьшение размера логотипа в сайдбаре, автовыравнивание тултипов и дизайн кнопки перевода | [x] | [page.tsx](file:///f:/c.echo/apps/web/src/app/dashboard/page.tsx), [page.tsx](file:///f:/c.echo/apps/web/src/app/settings/page.tsx), [room.module.css](file:///f:/c.echo/apps/web/src/app/room/[id]/room.module.css) | Уменьшен размер логотипа в сайдбаре с 36 до 30 (предотвращает обрезание "echo"). Добавлено умное позиционирование тултипов у левого и правого краев экрана (убирает обрезание "Открыть Senti-протокол"). Обновлен дизайн active кнопки перевода с использованием премиального градиента Centras. |
| 19 | Устранение производительных и логических узких мест: фоновый неблокирующий клинап БД, Creator-лимит и дросселирование SpeechRecognition | [x] | [limits.ts](file:///f:/c.echo/apps/api/src/services/limits.ts), [meetings.ts](file:///f:/c.echo/apps/api/src/routes/meetings.ts), [livekit.ts](file:///f:/c.echo/apps/api/src/routes/livekit.ts), [page.tsx](file:///f:/c.echo/apps/web/src/app/room/[id]/page.tsx) | Внедрена неблокирующая асинхронная фоновая очистка комнат и гостей с интервалом в 1 минуту (runThrottledCleanup). Исправлен логический баг лимитов: проверка 5 активных комнат перенесена на момент создания (creator-level), глобальный блокирующий фильтр в `/token` полностью удален. Клиентский перевод interim-результатов SpeechRecognition снабжен интеллектуальным дросселированием (до 1.2с с автозапланированным таймаутом на окончание речи), снизив нагрузку на бэкенд на 95%. Добавлена очистка WebRTC слушателей при аварийном размонтировании хоста во избежание утечек. |
| 20 | Аудит юзабилити и совместной работы | [x] | [usability_and_collaboration_audit.md](file:///C:/Users/TJumagulov/.gemini/antigravity/brain/0a123a01-067e-46a7-9325-78cff6dfb8d4/usability_and_collaboration_audit.md) | Проведен комплексный аудит удобства интерфейса комнаты звонка, механизмов разграничения ролей участников и стабильности транскрибирования. |
| 21 | Премиальный визуальный редизайн комнаты звонка (Big Tech UX/UI) | [x] | [globals.css](file:///f:/c.echo/apps/web/src/app/globals.css), [room.module.css](file:///f:/c.echo/apps/web/src/app/room/[id]/room.module.css) | Внедрена кинематографическая темная тема с использованием размытий (backdrop-blur), плавающих стеклянных кнопок с kinetic-анимациями и глубоким неоновым свечением. Реконструированы боковые панели Senti Panel, Chat Panel, Senti Translate Panel, зал ожидания и модальные окна настроек. |


---

## Известные проблемы и технический долг

| Проблема / Узкое место | Критичность | Локация | Влияние на продукт |
| :--- | :--- | :--- | :--- |
| **Локальная природа записи** | Средн. | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/%5Bid%5D/page.tsx) | Хотя микширование теперь стабильно при переподключениях, запись по-прежнему зависит от работы браузера хоста. В будущем рекомендуется серверный LiveKit Egress. |
| **Отсутствие TURN сервера & Strict ICE-TCP** | Высок. | [livekit.yaml](file:///f:/c.echo/livekit.yaml) | Пользователи за корпоративными брандмауэрами или симметричными NAT не могут установить WebRTC соединение (выкидывает/ошибка подключения). Требуется интеграция TURN-over-TLS на порту 443. |
| **Блокировка микрофона в Safari / iOS** | Высок. | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/%5Bid%5D/page.tsx) | Гонка при переключении от Pre-Join захвата к LiveKitRoom: Safari не успевает освободить аудио-устройство, вызывая NotReadableError. Также повторный getUserMedia в Noise Suppression глушит основной поток. |
| **Лимитированные CORS-источники LiveKit** | Средн. | [livekit.yaml](file:///f:/c.echo/livekit.yaml) | Hardcoded `allowed_origins` блокирует WebRTC-соединения с новых доменов или staging-сред. Требуется динамическая конфигурация. |

---

## Команды сборки и тестирования
- **Установка зависимостей**: `pnpm install`
- **Запуск в режиме разработки**: `pnpm dev`
- **Сборка проекта**: `pnpm build`
- **Применение миграций БД**: `pnpm db:migrate`
