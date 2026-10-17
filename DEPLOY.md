# FitSpot — публикация MVP по публичной ссылке

Инструкция актуальна для сборки `FitSpot-MVP-deploy`. Стек: **GitHub → Render (FastAPI) + Neon (PostgreSQL) + Netlify (React)**. Не используйте локальную SQLite для облачного деплоя: файловая система бесплатного Render временная.

> Это **публичная демоверсия**. Здесь нет оплаты, настоящих броней и CRM. Есть регистрация без проверки email, демо-корты, демо-тренеры и заявки. Не вводите реальные персональные данные и не используйте приложение как готовый коммерческий сервис.

## 0. Подготовка

Убедитесь, что в скачанном архиве есть папки `backend`, `frontend`, а также `netlify.toml` и `render.yaml`. Файлы `.env` и `fitspot.db` не надо загружать в GitHub. Они исключены через `.gitignore`. **Никогда не публикуйте `DATABASE_URL`, `JWT_SECRET` и `ADMIN_PASSWORD`**.

## 1. GitHub — исходники

1. На https://github.com/new создайте репозиторий, например `fitspot-mvp`, **Private**. Не отмечайте создание README в веб-интерфейсе (он уже есть в архиве).
2. Распакуйте архив и откройте PowerShell в папке с файлами `netlify.toml` и `render.yaml` (не в `frontend` или `backend`).
3. Выполните команды, заменив `USERNAME` на свой логин GitHub:

```powershell
git init
git add .
git commit -m "FitSpot MVP for deployment"
git branch -M main
git remote add origin https://github.com/USERNAME/fitspot-mvp.git
git push -u origin main
```

Если Git ещё не установлен: https://git-scm.com/downloads. GitHub может попросить авторизоваться через браузер. Пароль аккаунта GitHub в терминал не вставляйте.

## 2. Neon — постоянная PostgreSQL

1. Зайдите на https://console.neon.tech, создайте проект `fitspot-mvp` на бесплатном плане. Для минимальной задержки выберите регион поближе к Render.
2. В панели проекта нажмите **Connect** и скопируйте полную строку подключения Postgres, например:

```text
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

3. Это секрет; храните его только в **Render → Environment**, не в Netlify, GitHub и не в чате.
4. Наша SQLAlchemy автоматически распознаёт префикс `postgresql://` и переключается на драйвер `psycopg`.

## 3. Render — FastAPI

1. Зайдите на https://dashboard.render.com, откройте **New → Web Service**, привяжите приватный репозиторий GitHub `fitspot-mvp`.
2. Параметры (если Render не подхватил `render.yaml`):

| Настройка | Значение |
|---|---|
| Name | `fitspot-mvp-api` (если свободно) |
| Language / Runtime | Python |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Instance Type / Plan | Free |
| Health Check Path | `/api/health` |

3. В **Environment** задайте:

| Переменная | Значение |
|---|---|
| `ENVIRONMENT` | `production` |
| `SEED_DEMO` | `true` (100 кортов, демонстрационные тренеры и расписание) |
| `DATABASE_URL` | Полная секретная строка из Neon |
| `JWT_SECRET` | Длинная случайная строка (минимум 32 символа) |
| `ALLOWED_ORIGINS` | Пока можно указать предполагаемый Netlify URL, позже **обязательно заменим на точный** `https://....netlify.app` |
| `ADMIN_EMAIL` | Ваш личный email для входа администратором |
| `ADMIN_PASSWORD` | Ваш уникальный пароль (минимум 12 символов) |

Генерация `JWT_SECRET` в PowerShell:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

4. Запустите деплой (Deploy). Первый запуск создаст таблицы и тестовые данные, поэтому может занять больше времени.
5. В панели Render скопируйте **реальный** URL API (например `https://fitspot-mvp-api.onrender.com`). Проверьте в браузере `<адрес API>/api/health` — должен вернуться JSON с `"status":"ok"`.

**Демо-логины из локального README не работают в production:** пароли этих тренеров генерируются случайно и не раскрываются. Администратора создают только из ваших `ADMIN_EMAIL`/`ADMIN_PASSWORD`. После публикации можно зарегистрировать своего тренера и одобрить его через админку.

## 4. Netlify — React

1. Откройте https://app.netlify.com → **Add new project → Import an existing project → GitHub** и выберите этот же репозиторий.
2. В корне проекта лежит `netlify.toml`, где указаны `base = "frontend"`, `command = "npm run build"`, `publish = "dist"`, а также SPA-redirect. Если значения не определились автоматически, проставьте:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `dist` (относительно base)
3. До кнопки Deploy в настройках **Environment variables** добавьте:

```text
VITE_API_BASE_URL=https://ВАШ-РЕАЛЬНЫЙ-АДРЕС-API.onrender.com
```

Без суффикса `/api` и без конечного `/`. **Сюда не надо вставлять `DATABASE_URL`**.
4. Нажмите **Deploy**. После успешной сборки Netlify выдаст публичный `https://....netlify.app`.
5. Вернитесь в Render → Environment и установите `ALLOWED_ORIGINS` в **точный** адрес Netlify, например `https://fitspot-demo.netlify.app` (без `/` в конце), сохраните и перезапустите/переразверните backend.
6. Проверьте на Netlify регистрацию, обязательную анкету, фильтры, карточку тренера, запись, кабинет игрока. С телефона откройте карточку тренера: горизонтальной прокрутки окна быть не должно.

Если Netlify-адрес изменился, обновите `ALLOWED_ORIGINS` в Render. Если поменялся URL Render, обновите `VITE_API_BASE_URL` в Netlify и запустите новый build/deploy.

## 5. Типовые ошибки

- **Не открывается регистрация, `Failed to fetch`, CORS в F12:** проверьте `VITE_API_BASE_URL` на Netlify и точное значение `ALLOWED_ORIGINS` на Render. На бесплатном Render API может просыпаться около минуты после простоя.
- **Render пишет `Use persistent PostgreSQL`:** отсутствует/неверно задан `DATABASE_URL`. SQLite для облачного проекта сознательно запрещён.
- **Render пишет `Set a strong JWT_SECRET`:** задайте секрет минимум из 32 символов.
- **Render не стартует из-за PostgreSQL:** проверьте Connection string из Neon, пароль, SSL и лог Render; не передавайте пароль никому в виде скриншота.
- **На Netlify пустая страница / ошибка сборки:** откройте Deploy logs. Убедитесь, что выбран `frontend`, и что сборка прошла `npm run build`.
- **На другом URL ошибка 404 при обновлении страницы:** проверьте правило SPA redirects в `netlify.toml`.
- **Нет тренеров или кортов:** проверьте `SEED_DEMO=true` и логи первого старта API. Первое заполнение PostgreSQL может занимать время.
- **Не могу зайти `coach2@fitspot.local`:** в облачной версии пароль демо-тренеров специально не совпадает с локальным.

## Как безопасно показывать демо

- Вы можете создать игрока с вымышленными ФИО и почтой, заполнить анкету, оформить запись с любым номером брони, посмотреть её в ЛК.
- Для демонстрации роли тренера: зарегистрируйте **нового** тренера, заполните анкету и войдите под вашим `ADMIN_EMAIL`, чтобы одобрить его. Откройте окна в кабинете тренера. Профили тренеров, существовавшие изначально, можно показывать, но зайти в них в публичном окружении без их случайных паролей нельзя.
- Не добавляйте платёжные данные, настоящие документы, контакты клиентов и реальные номера бронирования.
- В будущем нужны полноценные миграции БД, верификация email, ограничение запросов, защита/хранение фото, восстановление пароля, мониторинг и резервное копирование.

## Обновление сайта

После правок в файлах локально:

```powershell
git add .
git commit -m "Update FitSpot"
git push
```

Netlify и Render автоматически развернут обновлённый код при включённом auto-deploy. Neon хранит данные отдельно, поэтому записи сохраняются при перезапуске и деплое приложений.
