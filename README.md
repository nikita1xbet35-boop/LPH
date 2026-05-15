# node — приватный мессенджер

Этап 1: рабочий каркас с auth, чатами и realtime.

## Требования

- Node.js 20+
- npm
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)
- Авторизация в Cloudflare (`wrangler login`)

## Установка

```bash
npm install
```

## Настройка D1

```bash
# Создать базу данных
wrangler d1 create messenger

# Скопировать database_id из вывода команды в backend/wrangler.toml
# Поле: database_id = "вставить сюда"

# Прогнать миграции локально (для dev)
cd backend
wrangler d1 execute messenger --local --file=./migrations/0001_init.sql

# Прогнать миграции на remote (для prod)
wrangler d1 execute messenger --remote --file=./migrations/0001_init.sql
```

## JWT Secret

Замени плейсхолдер в `backend/wrangler.toml` на случайную 64-символьную строку перед деплоем.

Для локальной разработки создай `backend/.dev.vars`:
```
JWT_SECRET=локальный_секрет_минимум_32_символа
```

## Создание admin

```bash
npm run admin:create -w backend -- <пароль>
```

## Запуск dev

```bash
npm run dev
```

- Backend: http://localhost:8787
- Frontend: http://localhost:5173

## Деплой

```bash
# Backend
npm run deploy -w backend

# Frontend (после настройки Pages проекта в Cloudflare)
npm run deploy -w frontend
```

## API Endpoints

### Auth
- `POST /api/auth/login` — вход
- `POST /api/auth/logout` — выход
- `GET /api/auth/me` — текущий юзер

### Users
- `GET /api/users` — список юзеров
- `PATCH /api/users/me` — обновить профиль

### Conversations
- `POST /api/conversations` — создать чат
- `GET /api/conversations` — список чатов
- `GET /api/conversations/:id` — один чат
- `GET /api/conversations/:id/messages` — сообщения

### Messages
- `POST /api/conversations/:id/messages` — отправить
- `DELETE /api/messages/:id` — удалить
- `POST /api/messages/:id/read` — прочитать

### Admin
- `POST /api/admin/users` — создать юзера
- `GET /api/admin/users` — список юзеров
- `DELETE /api/admin/users/:id` — удалить юзера
- `POST /api/admin/users/:id/reset-password` — сбросить пароль

### WebSocket
- `GET /ws?token=<jwt>&conversation_id=<id>`
