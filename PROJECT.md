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

---

## Известные проблемы и технический долг

| Проблема / Узкое место | Критичность | Локация | Влияние на продукт |
| :--- | :--- | :--- | :--- |
| **Локальная природа записи** | Средн. | [page.tsx](file:///f:/c.echo/apps/web/src/app/room/%5Bid%5D/page.tsx) | Хотя микширование теперь стабильно при переподключениях, запись по-прежнему зависит от работы браузера хоста. В будущем рекомендуется серверный LiveKit Egress. |

---

## Команды сборки и тестирования
- **Установка зависимостей**: `pnpm install`
- **Запуск в режиме разработки**: `pnpm dev`
- **Сборка проекта**: `pnpm build`
- **Применение миграций БД**: `pnpm db:migrate`
