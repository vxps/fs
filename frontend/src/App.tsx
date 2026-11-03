import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, CalendarDays, Clock, MapPin, Star, UserRound, LogOut, X, ShieldCheck, Plus, Trash2, Info, Check, ChevronDown, Trophy, Settings2, AlertCircle, Filter, Menu } from 'lucide-react';
import { api, post, type User, type AuthResponse, type Sport, type Coach, type Court, type Slot, type Booking, type Questionnaire, type CoachMine, type FeedItem, price, dt, hour, shortDay, sportLabel } from './api';

type Page = 'home' | 'feed' | 'courts' | 'bookings' | 'coach' | 'profile' | 'admin';
const districts = ['Любой район', 'Хамовники', 'Пресня', 'Сокол', 'Арбат', 'Таганский', 'Басманный', 'Раменки', 'Аэропорт', 'Хорошёво', 'Мещанский'];
const levels = ['Начинающий', 'Любитель', 'Продвинутый', 'Спортивный'];
const priorities = ['Близость', 'Стоимость', 'Опыт тренера', 'Удобное время', 'Качество корта'];
const times = ['Утро (до 12:00)', 'День (12:00–17:00)', 'Вечер (после 17:00)', 'В любое время'];
const goals = ['Научиться с нуля', 'Улучшить технику', 'Подготовиться к соревнованиям', 'Вернуться после перерыва', 'Играть для удовольствия'];
const ntrpLevels = Array.from(
  { length: 13 },
  (_, i) => (1 + i * 0.5).toFixed(1)
);

const cancellationOptions = [
  'Бесплатная отмена в любое время',
  'Бесплатная отмена за 6 часов',
  'Бесплатная отмена за 12 часов',
  'Бесплатная отмена за 24 часа',
];
const bookingTitles: Record<string, string> = { awaiting_court: 'Ожидает брони корта', confirmed: 'Тренировка подтверждена', completed: 'Проведена', no_show: 'Неявка', cancelled: 'Отменена' };
const nextDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
};
function IconAvatar({ emoji = '🎾', color = '#dff0c3', size = '' }: { emoji?: string; color?: string; size?: string }) {
  return <div className={`avatar ${size}`} style={{ background: color }}>
    <span>
      {emoji}
    </span>
    <i>fitspot</i>
  </div>
}
function Brand({ go }: { go: () => void }) {
  return <button className="brand" onClick={go}><span className="brand-dot-icon">◕</span>fit<span>spot</span><b>.</b></button>
}
function Button({ children, onClick, ghost = false, disabled = false, type = 'button', className = '' }: { children: ReactNode; onClick?: () => void; ghost?: boolean; disabled?: boolean; type?: 'submit' | 'button'; className?: string }) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`btn ${ghost ? 'btn-ghost' : 'btn-primary'} ${className}`}>
    {children}
  </button>
}
function Alert({ text }: { text: string }) {
  return text ? <div className="error">
    <AlertCircle size={17} />
    {text}
  </div> : null
}
function Modal({ children, onClose, title, locked = false, wide = false }: { children: ReactNode; onClose?: () => void; title: string; locked?: boolean; wide?: boolean }) {
  return <div className="overlay" onMouseDown={() => {
    if (!locked) onClose?.()
  }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}>
      {!locked && <button aria-label="Закрыть" className="close" onClick={onClose}>
        <X size={22} />
      </button>}
      {children}
    </div>
  </div>
}
function Spin() {
  return <div className="loader"><div className="spinner" />Загружаем...</div>
}
function Banner({ title, children }: { title: string; children: ReactNode }) {
  return <div className="info-banner">
    <Info size={20} />
    <span>
      <b>
        {title}
      </b>
      {children}
    </span>
  </div>
}
function Select({ label, value, set, children }: { label: string; value: string; set: (v: string) => void; children: ReactNode }) {
  return <label className="field">
    {label}
    <span className="select-wrap">
      <select value={value} onChange={e => set(e.target.value)}>
        {children}
      </select>
      <ChevronDown size={16} />
    </span>
  </label>
}
function SportOptions({ value, onChange }: { value: Sport; onChange: (s: Sport) => void }) {
  return <div className="segmented">
    <button type="button" className={value === 'tennis' ? 'active' : ''} onClick={() => onChange('tennis')}>🎾 Теннис</button>
    <button type="button" className={value === 'padel' ? 'active' : ''} onClick={() => onChange('padel')}>🏓 Падел</button>
  </div>
}

function DistrictPicker({
  selected,
  onChange,
  required = false,
}: {
  selected: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
}) {
  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter(x => x !== value)
        : [...selected, value]
    );

  }


  return (
    <div className="district-dropdown">
      <details>
        <summary>
          {selected.length
            ? selected.join(', ')
            : required
              ? 'Выберите районы'
              : 'Все районы'}
        </summary>

        <div className="district-dropdown-menu">
          <button
            type="button"
            className="district-clear"
            onClick={() => onChange([])}
          >
            {required ? 'Очистить выбор' : 'Все районы'}
          </button>

          {districts
            .filter(d => d !== 'Любой район')
            .map(d => (
              <label key={d} className="district-option">
                <input
                  type="checkbox"
                  checked={selected.includes(d)}
                  onChange={() => toggle(d)}
                />
                {d}
              </label>
            ))}
        </div>
      </details>
    </div>
  );
}

function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return <div className="empty">
    <span>🎾</span>
    <h3>
      {text}
    </h3>
    {children}
  </div>
}

function Rackets() {
  return <div className="rackets">
    <div className="racket racket-left">
      <div className="racket-head">
        <span className="net-lines" />
      </div>
      <div className="racket-stem" />
    </div>
    <div className="racket racket-right">
      <div className="racket-head">
        <span className="net-lines" />
      </div>
      <div className="racket-stem" />
    </div>
    <div className="tennis-ball" />
    <div className="rackets-tag">ТЕННИС & ПАДЕЛ</div>
  </div>
}

function Auth({ onClose, onAuth }: { onClose: () => void; onAuth: (auth: AuthResponse) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [role, setRole] = useState<'player' | 'coach'>('player');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = mode === 'register' ? { name, email, password, role } : { email, password };
      const result = await api<AuthResponse>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) }, false);
      onAuth(result)
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  return <Modal onClose={onClose} title="Регистрация и вход">
    <div className="modal-heading">
      <span className="kicker">FITSPOT / АККАУНТ</span>
      <h2>
        {mode === 'register' ? 'Присоединяйся к игре' : 'С возвращением!'}
      </h2>
      <p>
        {mode === 'register' ? 'Выбери роль и создай аккаунт.' : 'Войди, чтобы продолжить.'}
      </p>
    </div>
    <div className="auth-tabs">
      <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Регистрация</button>
      <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Вход</button>
    </div>
    <form className="form" onSubmit={submit}>
      {mode === 'register' && <><label className="field">Я хочу зарегистрироваться как<div className="segmented">
        <button type="button" className={role === 'player' ? 'active' : ''} onClick={() => setRole('player')}>Игрок</button>
        <button type="button" className={role === 'coach' ? 'active' : ''} onClick={() => setRole('coach')}>Тренер</button>
      </div></label><label className="field">Имя и фамилия<input required minLength={2} value={name} onChange={e => setName(e.target.value)} placeholder="Александр Иванов" /></label></>}
      <label className="field">Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>
      <label className="field">Пароль<input type="password" required minLength={mode === 'register' ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 8 символов" /></label>
      <Alert text={err} />
      <Button type="submit" disabled={busy} className="full">
        {busy ? 'Подождите...' : mode === 'register' ? 'Продолжить' : 'Войти'}
        <ArrowRight size={18} />
      </Button>
    </form>
    {mode === 'register' && <p className="tiny muted">После регистрации потребуется заполнить обязательную анкету.</p>}
  </Modal>
}

const blankQuestionnaire: Questionnaire = {
  sport: 'tennis',
  experience: 'Никогда не играл(а)',
  level: 'Начинающий',
  district: '',
  convenient_time: 'Вечер (после 17:00)',
  priority: 'Близость',
  goal: goals[0],
  has_racket: false,
  ntrp: null,
};


function PlayerOnboarding({
  onDone,
  onLogout,
  initial,
  onCancel,
}: {
  onDone: (user: User, questionnaire: Questionnaire) => void;
  onLogout: () => void;
  initial?: Questionnaire;
  onCancel?: () => void;
}) {
  const [data, setData] = useState<Questionnaire>(
    initial ?? blankQuestionnaire
  );

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function change<K extends keyof Questionnaire>(
    key: K,
    value: Questionnaire[K]
  ) {
    setData(d => ({ ...d, [key]: value }));

  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!data.district.trim()) {
      setErr('Выберите хотя бы один район для поиска');

      return;
    }
    setBusy(true);
    setErr('');
    try {
      const updatedUser = await post<User>(
        '/player/questionnaire',
        data
        );

        onDone(updatedUser, data);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
        locked={!onCancel}
        onClose={onCancel}
        title={
        onCancel
            ? 'Редактирование анкеты'
            : 'Обязательная анкета игрока'
        }
        wide
    >
    <div className="modal-heading">
      <span className="kicker">
        {onCancel
            ? 'ЛИЧНЫЙ КАБИНЕТ / АНКЕТА'
            : 'ШАГ 2 ИЗ 2 / ОБЯЗАТЕЛЬНО'}
        </span>

        <h2>
        {onCancel ? 'Редактировать анкету' : 'Расскажи о своей игре'}
        </h2>

        <p>
        {onCancel
            ? 'Измени предпочтения — они будут учтены при поиске тренировок.'
            : 'Эта анкета поможет подобрать тренировки. Пока она не заполнена, запись недоступна.'}
        </p>
    </div>
    <form className="form" onSubmit={save}>
      <div className="field">Вид спорта<SportOptions value={data.sport} onChange={v => change('sport', v)} /></div>
      <div className="form-grid"><Select label="Опыт" value={data.experience} set={v => change('experience', v)}>
        {['Никогда не играл(а)', 'Менее 6 месяцев', '6–12 месяцев', '1–3 года', 'Более 3 лет', 'Возвращаюсь после перерыва'].map(v => <option key={v}>
          {v}
        </option>)}
      </Select><Select label="Уровень" value={data.level} set={v => change('level', v)}>
          {levels.map(v => <option key={v}>
            {v}
          </option>)}
        </Select>
        <label className="field">
          NTRP (необязательно)
          <select
            value={data.ntrp ?? ''}
            onChange={e => change('ntrp', e.target.value || null)}
          >
            <option value="">Не указывать</option>
            {ntrpLevels.map(v => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Есть ли у вас своя ракетка?
          <select
            value={data.has_racket ? 'yes' : 'no'}
            onChange={e =>
              change('has_racket', e.target.value === 'yes')
            }
          >
            <option value="yes">Да, есть</option>
            <option value="no">Нет, понадобится ракетка тренера</option>
          </select>
        </label>
        <div className="field">
          Предпочитаемые районы для поиска *
          <DistrictPicker
            required
            selected={data.district
              .split(',')
              .map(x => x.trim())
              .filter(Boolean)}
            onChange={values => change('district', values.join(','))}
          />
        </div><Select label="Удобное время" value={data.convenient_time} set={v => change('convenient_time', v)}>
          {times.map(v => <option key={v}>
            {v}
          </option>)}
        </Select><Select label="Что важнее всего" value={data.priority} set={v => change('priority', v)}>
          {priorities.map(v => <option key={v}>
            {v}
          </option>)}
        </Select><Select label="Цель занятий" value={data.goal} set={v => change('goal', v)}>
          {goals.map(v => <option key={v}>
            {v}
          </option>)}
        </Select></div>
      <Alert text={err} />
      
        <div className="modal-actions">
        <Button type="submit" disabled={busy}>
            {busy
            ? 'Сохраняем...'
            : onCancel
                ? 'Сохранить изменения'
                : 'Сохранить анкету'}
            <ArrowRight size={18} />
        </Button>

        {onCancel ? (
            <button
            type="button"
            className="link-text"
            onClick={onCancel}
            >
            Отмена
            </button>
        ) : (
            <button
            type="button"
            className="link-text"
            onClick={onLogout}
            >
            Выйти из аккаунта
            </button>
        )}
        </div>

    </form>
  </Modal>)
}


type CoachForm = {
  headline: string;
  bio: string;
  sports: Sport[];
  levels: string[];
  experience_years: number;
  ntrp: string | null;
  certificates: string;
  telegram: string;
  phone: string;
  photo_data_url: string;
  formats: string[];
  price: number;
  split_price: number;
  group_price: number;
  duration_minutes: number;
  court_ids: number[];
  cancellation_policy: string;
  invite_code: string;
};

const blankCoach: CoachForm = {
  headline: 'Персональные тренировки',
  bio: '',
  sports: ['tennis'],
  levels: ['Начинающий', 'Любитель'],
  experience_years: 3,
  ntrp: null,
  certificates: '',
  telegram: '',
  phone: '',
  photo_data_url: '',
  formats: ['individual'],
  price: 3000,
  split_price: 2500,
  group_price: 1600,
  duration_minutes: 60,
  court_ids: [],
  cancellation_policy: 'Бесплатная отмена за 24 часа',
  invite_code: '',
};

async function readCompressed(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Выберите изображение'));
      return
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Не удалось обработать фото'));
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const result = canvas.toDataURL('image/jpeg', 0.65);
        if (result.length > 350000) {
          reject(new Error('Фото слишком большое'));
          return
        }
        resolve(result)
      };
      img.onerror = () => reject(new Error('Ошибка чтения фотографии'));
      img.src = String(reader.result)
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file)
  })
}
function CoachOnboarding({ courts, onDone, onLogout, initial, onCancel }: { courts: Court[]; onDone: (u: User) => void; onLogout: () => void; initial?: CoachForm; onCancel?: () => void }) {
  const [data, setData] = useState<CoachForm>(initial || blankCoach);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [district, setDistrict] = useState('Любой район');

  const change = <K extends keyof CoachForm>(key: K, value: CoachForm[K]) => setData(v => ({ ...v, [key]: value }));

  const toggle = <K extends 'sports' | 'levels' | 'formats' | 'court_ids'>(key: K, v: CoachForm[K][number]) => setData(d => {
    const arr = d[key] as (string | number)[];
    return { ...d, [key]: arr.includes(v) ? arr.filter(s => s !== v) : [...arr, v] }
  });

  const selectable = courts.filter(c => data.sports.includes(c.sport) && (district === 'Любой район' || c.district === district));

  async function imageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      change('photo_data_url', await readCompressed(file))
    } catch (err) {
      setErr(String(err instanceof Error ? err.message : err))
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!data.photo_data_url) {
      setErr('Добавьте фотографию тренера — она обязательна для проверки профиля.');
      return
    }
    if (!data.court_ids.length) {
      setErr('Выберите хотя бы один корт.');
      return
    }
    setBusy(true);
    try {
      onDone(await post<User>('/coach/onboarding', data))
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Анкета тренера" wide locked={!onCancel} onClose={onCancel}>
    <div className="modal-heading">
      <span className="kicker">
        {initial ? 'ПРОФИЛЬ ТРЕНЕРА' : 'РЕГИСТРАЦИЯ / ОБЯЗАТЕЛЬНАЯ АНКЕТА'}
      </span>
      <h2>Настрой свой профиль тренера</h2>
      <p>Профиль появится в поиске после проверки администратором. Выплаты и Telegram-бот пока не подключены.</p>
    </div>
    <form className="form" onSubmit={save}><h3 className="subheading">1. О себе</h3><div className="form-grid">
      <label className="field">Заголовок профиля<input required minLength={5} value={data.headline} onChange={e => change('headline', e.target.value)} /></label>
      <label className="field">Стаж, лет<input type="number" min="0" max="70" required value={data.experience_years} onChange={e => change('experience_years', Number(e.target.value))} /></label>
    </div>
      <label className="field">
        Ваш уровень NTRP (необязательно)
        <select
          value={data.ntrp ?? ''}
          onChange={e =>
            change('ntrp', e.target.value || null)
          }
        >
          <option value="">Не указывать</option>
          {ntrpLevels.map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label><label className="field">Описание и методика (от 20 символов)<textarea required minLength={20} rows={3} value={data.bio} onChange={e => change('bio', e.target.value)} placeholder="С кем работаете, какие результаты и подход к занятиям..." /></label><label className="field">Сертификаты и достижения (при наличии)<textarea rows={2} value={data.certificates} onChange={e => change('certificates', e.target.value)} /></label><div className="form-grid">
        <label className="field">Контакт Telegram<input required value={data.telegram} onChange={e => change('telegram', e.target.value)} placeholder="@username" /></label>
        <label className="field">Телефон (необязательно)<input value={data.phone} onChange={e => change('phone', e.target.value)} placeholder="+7..." /></label>
      </div><label className="field">Фотография для проверки профиля (обязательно)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={imageChange} />{data.photo_data_url && <span className="field-small success"><Check size={14} /> Фотография добавлена</span>}</label><h3 className="subheading">2. Специализация</h3><div className="form-grid">
        <div className="field">Виды спорта<div className="choice-row">
          {(['tennis', 'padel'] as Sport[]).map(s => <label key={s} className="check-pill">
            <input checked={data.sports.includes(s)} type="checkbox" onChange={() => setData(d => ({ ...d, sports: d.sports.includes(s) ? d.sports.filter(x => x !== s) : [...d.sports, s], court_ids: [] }))} />
            {sportLabel(s)}
          </label>)}
        </div></div>
        <div className="field">Уровень учеников<div className="choice-row">
          {levels.map(l => <label key={l} className="check-pill">
            <input type="checkbox" checked={data.levels.includes(l)} onChange={() => toggle('levels', l)} />
            {l}
          </label>)}
        </div></div>
      </div><h3 className="subheading">3. Форматы и цены</h3><div className="choice-row">
        {[['individual', '1:1'], ['split', 'Сплит'], ['group', 'Группа']].map(([id, label]) => <label key={id} className="check-pill">
          <input type="checkbox" checked={data.formats.includes(id)} onChange={() => toggle('formats', id)} />
          {label}
        </label>)}
      </div><div className="form-grid">
        <label className="field">Цена 1:1, ₽<input type="number" min="100" value={data.price} onChange={e => change('price', Number(e.target.value))} /></label>
        <label className="field">Длительность, минут<input type="number" min="30" max="180" step="30" value={data.duration_minutes} onChange={e => change('duration_minutes', Number(e.target.value))} /></label>
        {data.formats.includes('split') && <label className="field">Цена сплита за человека, ₽<input type="number" min="0" value={data.split_price} onChange={e => change('split_price', Number(e.target.value))} /></label>}
        {data.formats.includes('group') && <label className="field">Цена группы за человека, ₽<input type="number" min="0" value={data.group_price} onChange={e => change('group_price', Number(e.target.value))} /></label>}
      </div><h3 className="subheading">4. Клубы и бронирование корта</h3><Select label="Фильтр по району" value={district} set={setDistrict}>
        {districts.map(d => <option key={d}>
          {d}
        </option>)}
      </Select><div className="court-checkbox-grid">
        {selectable.map(c => <label key={c.id} className="court-check">
          <input type="checkbox" checked={data.court_ids.includes(c.id)} onChange={() => toggle('court_ids', c.id)} />
          <div>
            <strong>{c.club} · {c.name}</strong>
            <small>{sportLabel(c.sport)} · {price(c.price)} / час</small>
          </div>
        </label>)}
      </div><p className="tiny">Выбрано кортов: <b>
        {data.court_ids.length}
      </b>. Это демонстрационные объекты, не реальные площадки.</p><div className="form-grid">
        <label className="field">Код приглашения (необязательно)<input value={data.invite_code} onChange={e => change('invite_code', e.target.value)} /></label>
      </div><Select
        label="Правила бесплатной отмены"
        value={data.cancellation_policy}
        set={v => change('cancellation_policy', v)}
      >
        {cancellationOptions.map(value => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select><Alert text={err} /><div className="modal-actions">
        <Button type="submit" disabled={busy}>
          {busy ? 'Сохраняем...' : 'Отправить профиль на проверку'}
          <ArrowRight size={17} />
        </Button>
        {!onCancel && <button className="link-text" type="button" onClick={onLogout}>Выйти из аккаунта</button>}
      </div></form>
  </Modal>
}

function CoachCard({ coach, onClick }: { coach: Coach; onClick: () => void }) {
  return <button className="coach-card" onClick={onClick}>
    <IconAvatar emoji={coach.emoji} color={coach.color} />
    <div className="card-content">
      <div className="card-rating"><Star size={15} fill="currentColor" /> {coach.rating.toFixed(1)} <span>· {coach.experience_years} лет опыта</span></div>
      <h3>
        {coach.name}
      </h3>
      <p>
        {coach.headline}
      </p>
      <div className="mini-line"><MapPin size={15} /> {coach.districts.join(', ')}</div>
      <div className="card-bottom">
        <span>
          <small>Тренировка</small>
          <strong>
            {price(coach.price)}
          </strong>
        </span>
        <i>
          <ArrowUpRight size={21} />
        </i>
      </div>
    </div>
  </button>
}
function CourtCard({ court }: { court: Court }) {
  return <div className="court-card">
    <div className="court-graphic">
      <span>
        {court.sport === 'tennis' ? '🎾' : '🏓'}
      </span>
      <div>{court.indoor ? 'Крытый' : 'Открытый'} · {court.surface}</div>
    </div>
    <div className="court-content">
      <span className="kicker">
        {sportLabel(court.sport)}
      </span>
      <h3>
        {court.club}
      </h3>
      <p>
        {court.name}
      </p>
      <div className="mini-line">
        <MapPin size={15} />
        {court.district}
      </div>
      <strong>{price(court.price)} <small>/ час</small></strong>
    </div>
  </div>
}


function Detail({
  coach,
  initialCourtId,
  needRacket,
  onClose,
  onCreated,
}: {
  coach: Coach;
  initialCourtId?: number;
  needRacket: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [courtId, setCourtId] = useState(
    initialCourtId ?? coach.courts?.[0]?.id ?? 0
  );

  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);

  const [slot, setSlot] = useState<Slot | null>(null);

  const [day, setDay] = useState('');

  const [loading, setLoading] = useState(false);

  const [busy, setBusy] = useState(false);

  const [err, setErr] = useState('');


  const [objective, setObjective] = useState(goals[0]);

  const [experience, setExperience] = useState('');

  const [racket, setRacket] = useState(needRacket);

  const [comment, setComment] = useState('');


  const courts = coach.courts ?? [];

  const selectedCourt = courts.find(c => c.id === courtId);


  useEffect(() => {
    if (!courtId) {
      setAvailableSlots([]);

      return;

    }


    let active = true;

    setLoading(true);

    setErr('');


    api<Slot[]>(
      `/coaches/${coach.id}/courts/${courtId}/slots`,
      {},
      false
    )
      .then(result => {
        if (active) setAvailableSlots(result);

      })
      .catch(e => {
        if (active) {
          setErr(e instanceof Error ? e.message : String(e));

        }

      })
      .finally(() => {
        if (active) setLoading(false);

      });


    return () => {
      active = false;
    };

  }, [coach.id, courtId]);


  const days = [
    ...new Set(
      availableSlots.map(s => s.starts_at.slice(0, 10))
    )
  ];


  const selectedDay = day || days[0] || '';


  const slots = availableSlots.filter(
    s => s.starts_at.startsWith(selectedDay)
  );


  function changeCourt(id: number) {
    setCourtId(id);

    setSlot(null);

    setDay('');

    setAvailableSlots([]);

  }


  async function book(e: FormEvent) {
    e.preventDefault();


    if (!slot || !courtId) return;


    setBusy(true);

    setErr('');


    try {
      await post('/bookings', {
        slot_id: slot.id,
        court_id: courtId,
        objective,
        experience,
        need_racket: racket,
        comment,
      });

      onCreated();

    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));

    } finally {
      setBusy(false);

    }

  }


  return (
    <Modal title={`Тренер ${coach.name}`} onClose={onClose} wide>
      <div className="detail-header">
        <IconAvatar
          emoji={coach.emoji}
          color={coach.color}
          size="avatar-small"
        />
        <div>
          <span className="kicker">ПРОФИЛЬ ТРЕНЕРА</span>
          <h2>
            {coach.name}
          </h2>
          <p>
            {coach.headline}
          </p>
          <div className="detail-badges">
            <span><Star size={14} /> {coach.rating.toFixed(1)}</span>
            <span><Trophy size={14} /> {coach.experience_years} лет опыта</span>
            {coach.ntrp && <span>NTRP {coach.ntrp}</span>}
            <span><ShieldCheck size={14} /> Проверен</span>
          </div>
        </div>
      </div>

      <div className="detail-columns">
        <div>
          <h3>О тренере</h3>
          <p className="detail-description">
            {coach.bio}
          </p>
          <div className="meta-row">
            <MapPin size={18} />
            {coach.districts.join(', ')}
          </div>
          <div className="meta-row">
            <ShieldCheck size={18} />
            {coach.cancellation_policy}
          </div>

          <h3>1. Выберите корт</h3>

          <label className="field">
            Корт для тренировки
            <select
              value={courtId}
              onChange={e => changeCourt(Number(e.target.value))}
            >
              {!courts.length && <option value={0}>Нет кортов</option>}
              {courts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.club} · {c.name} — {price(c.price)}
                </option>
              ))}
            </select>
          </label>

          {selectedCourt && (
            <p className="tiny muted">
              {selectedCourt.district} · {selectedCourt.surface}
            </p>
          )}

          <h3>2. Выберите дату и время</h3>
          <p className="tiny muted">
            Только совместно свободные окна тренера и корта. Время МСК.
          </p>

          {loading ? (
            <Spin />
          ) : (
            <>
              <div className="date-strip">
                {days.map(value => (
                  <button
                    key={value}
                    type="button"
                    className={selectedDay === value ? 'picked' : ''}
                    onClick={() => {
                      setDay(value);

                      setSlot(null);

                    }}
                  >
                    {shortDay(value)}
                  </button>
                ))}
              </div>

              <div className="time-strip">
                {slots.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={slot?.id === s.id ? 'picked' : ''}
                    onClick={() => setSlot(s)}
                  >
                    {hour(s.starts_at)}
                  </button>
                ))}
              </div>

              {!availableSlots.length && (
                <p className="muted">
                  На этом корте нет свободного времени у тренера.
                </p>
              )}
            </>
          )}
        </div>

        <form className="booking-panel" onSubmit={book}>
          <span className="kicker">ОФОРМЛЕНИЕ ЗАПИСИ</span>

          <h3>{price(coach.price)} <small>/ тренер</small></h3>

          {slot ? (
            <div className="selected-slot">
              <CalendarDays size={18} />
              {dt(slot.starts_at)}
            </div>
          ) : (
            <p className="muted">Сначала выберите время</p>
          )}

          <div className="price-box">
            <span>Тренер: {price(coach.price)}</span>
            <span>Корт: {price(selectedCourt?.price ?? 0)}</span>
            <strong>
              Итого: {price(coach.price + (selectedCourt?.price ?? 0))}
            </strong>
          </div>

          <label className="field">
            Цель занятий
            <select
              value={objective}
              onChange={e => setObjective(e.target.value)}
            >
              {goals.map(g => <option key={g}>
                {g}
              </option>)}
            </select>
          </label>

          <label className="field">
            Опыт, комментарий по уровню
            <input
              value={experience}
              onChange={e => setExperience(e.target.value)}
              placeholder="Занимаюсь около года"
            />
          </label>

          <label className="check-pill">
            <input
              type="checkbox"
              checked={racket}
              onChange={e => setRacket(e.target.checked)}
            />
            Нужна ракетка у тренера
          </label>

          <label className="field">
            Комментарий тренеру
            <textarea
              rows={2}
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </label>

          <Alert text={err} />

          <Button
            type="submit"
            className="full"
            disabled={!slot || !courtId || loading || busy}
          >
            {busy ? 'Создаём...' : 'Создать предварительную запись'}
            <ArrowRight size={17} />
          </Button>

          <p className="tiny muted">
            Оплаты пока нет. После записи необходимо подтвердить бронь корта.
          </p>
        </form>
      </div>
    </Modal>
  );
}


function ConfirmCourt({ booking, onClose, onConfirm }: { booking: Booking; onClose: () => void; onConfirm: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await onConfirm(code.trim())
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }
  return <Modal onClose={onClose} title="Подтвердить бронь корта">
    <div className="modal-heading">
      <span className="kicker">БРОНИРОВАНИЕ КОРТА</span>
      <h2>Подтверди корт</h2>
      <p>{booking.court?.club} · {booking.court?.name}</p>
    </div>
    <Banner title="Демонстрационное подтверждение">Никакая внешняя CRM не вызывается. Введите любой непустой номер, чтобы показать работу флоу.</Banner>
    <form className="form" onSubmit={submit}>
      <label className="field">
        {booking.court_booker === 'coach' ? 'Номер корта / брони' : 'Номер брони с сайта клуба'}
        <input required minLength={1} maxLength={140} value={code} onChange={e => setCode(e.target.value)} placeholder="Например, FIT-2026-123" />
      </label>
      <Alert text={err} />
      <Button type="submit" disabled={busy} className="full">
        {busy ? 'Подтверждаем...' : 'Корт забронирован'}
        <Check size={18} />
      </Button>
    </form>
  </Modal>
}

function App() {
  const [feedDistricts, setFeedDistricts] = useState<string[]>([]);

  const [selectedCourtByCoach, setSelectedCourtByCoach] =
    useState<Record<number, number>>({});

  const [detailCourtId, setDetailCourtId] =
    useState<number | undefined>(undefined);

  const [coachContact, setCoachContact] = useState<{
    name: string;
    telegram: string;
    phone: string;
  } | null>(null);

  const [page, setPage] = useState<Page>('home');
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mine, setMine] = useState<CoachMine | null>(null);
  const [pending, setPending] = useState<{ id: number; name: string; headline: string; bio: string; sports: Sport[]; price: number; experience_years: number; completed: boolean; certificates: string; photo_data_url: string; telegram: string; club: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [sport, setSport] = useState('');
  const [district, setDistrict] = useState('Любой район');
  const [sort, setSort] = useState('recommended');
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState('');
  const [detail, setDetail] = useState<Coach | null>(null);
  const [confirm, setConfirm] = useState<Booking | null>(null);
  const [editCoach, setEditCoach] = useState(false);
  const [editingQuestionnaire, setEditingQuestionnaire] =
  useState<Questionnaire | null>(null);

  const [playerEditLoading, setPlayerEditLoading] = useState(false);
  const [slotDate, setSlotDate] = useState(nextDay());
  const [slotTime, setSlotTime] = useState('18:00');
  const [repeat, setRepeat] = useState(1);
  const [slotBusy, setSlotBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4600)
  };
  
async function openPlayerEdit() {
  if (user?.role !== 'player') return;

  setPlayerEditLoading(true);

  try {
    const questionnaire = await api<Questionnaire>(
      '/player/questionnaire'
    );

    setEditingQuestionnaire(questionnaire);
  } catch (error) {
    notify(
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    setPlayerEditLoading(false);
  }
}

function savePlayerEdit(
  updatedUser: User,
  questionnaire: Questionnaire
) {
  setUser(updatedUser);
  setEditingQuestionnaire(null);

  // Обновляем поисковые предпочтения
  const selectedDistricts = questionnaire.district
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  setFeedDistricts(selectedDistricts);
  setDistrict(selectedDistricts[0] ?? 'Любой район');
  setSport(questionnaire.sport);

  setPeriod(
    questionnaire.convenient_time.startsWith('Утро')
      ? 'morning'
      : questionnaire.convenient_time.startsWith('День')
        ? 'afternoon'
        : questionnaire.convenient_time.startsWith('Вечер')
          ? 'evening'
          : ''
  );

  notify('Анкета успешно обновлена');
}


  const refreshUser = useCallback(async () => {
    try {
      setUser(await api<User>('/auth/me'))
    } catch {
      localStorage.removeItem('fitspot_token');
      setUser(null)
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('fitspot_token')) void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!user || user.role !== 'player' || !user.onboarding_complete) {
      return;

    }


    void api<Questionnaire>('/player/questionnaire')
      .then(q => {
        const selected = q.district
          .split(',')
          .map(d => d.trim())
          .filter(d => d && d !== 'Любой район');


        setSport(q.sport);

        setFeedDistricts(selected);

        setDistrict(selected[0] ?? 'Любой район');

        setPeriod(
          q.convenient_time.startsWith('Утро') ? 'morning'
            : q.convenient_time.startsWith('День') ? 'afternoon'
              : q.convenient_time.startsWith('Вечер') ? 'evening'
                : ''
        );

      })
      .catch(() => { });

  }, [user?.id, user?.onboarding_complete]);

  const loadPublic = useCallback(async () => {
    try {
      const [cs, co] = await Promise.all([api<Coach[]>('/coaches', {}, false), api<Court[]>('/courts', {}, false)]);
      setCoaches(cs);
      setCourts(co)
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    }
  }, []);

  useEffect(() => {
    void loadPublic()
  }, [loadPublic]);

  const loadFeed = useCallback(async () => {
    setLoading(true);

    setErr('');


    try {
      const params = new URLSearchParams({
        sport,
        sort,
        date,
        period,
        limit: '60',
      });


      if (feedDistricts.length) {
        params.set('districts', feedDistricts.join(','));

      }


      const data = await api<FeedItem[]>(
        `/feed?${params.toString()}`,
        {},
        false
      );


      setFeed(data);

    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));

    } finally {
      setLoading(false);

    }
  }, [sport, sort, date, period, feedDistricts]);


  useEffect(() => {
    if (page === 'feed') void loadFeed()
  }, [page, loadFeed]);

  const loadBookings = useCallback(async () => {
    if (!user || !['player', 'coach'].includes(user.role)) return;
    setLoading(true);
    try {
      setBookings(await api<Booking[]>('/bookings/my'))
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }, [user]);

  useEffect(() => {
    if (page === 'bookings' && user?.onboarding_complete) void loadBookings()
  }, [page, loadBookings, user]);

  const loadMine = useCallback(async () => {
    if (user?.role !== 'coach' || !user.onboarding_complete) return;
    try {
      setMine(await api<CoachMine>('/coach/me'))
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e))
    }
  }, [user]);

  useEffect(() => {
    if (page === 'coach') void loadMine()
  }, [page, loadMine]);

  useEffect(() => {
    if (page === 'admin' && user?.role === 'admin') void api<typeof pending>('/admin/pending').then(setPending).catch(e => notify(String(e instanceof Error ? e.message : e)))
  }, [page, user]);

  const navigate = (p: Page) => {
    if ((p === 'feed' || p === 'courts') && !user) {
      setAuthOpen(true);

      setMobileMenu(false);

      return;

    }


    if (
      (p === 'feed' || p === 'courts') &&
      user &&
      !user.onboarding_complete
    ) {
      notify('Сначала заполните обязательную анкету');

      return;

    }


    setPage(p);

    setMobileMenu(false);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  const logout = () => {
    localStorage.removeItem('fitspot_token');
    setUser(null);
    setAuthOpen(false);
    setEditCoach(false);
    navigate('home')
  };

  function onAuth(data: AuthResponse) {
    localStorage.setItem(
      'fitspot_token',
      data.access_token
    );


    setUser(data.user);

    setAuthOpen(false);

    notify('Добро пожаловать в FitSpot!');


    const target: Page =
      data.user.role === 'coach' ? 'coach'
        : data.user.role === 'admin' ? 'admin'
          : 'feed';


    setPage(target);

    setMobileMenu(false);
  }

  async function showCoachContact(
    coachId: number,
    coachName: string
  ) {
    try {
      const result = await api<{
        telegram: string;
        phone: string;
      }>(`/coaches/${coachId}/contact`);


      setCoachContact({
        name: coachName,
        telegram: result.telegram,
        phone: result.phone,
      });

    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));

    }
  }


  const needsOnboarding = Boolean(user && !user.onboarding_complete && user.role !== 'admin');

  async function openDetail(id: number, preferredCourtId?: number) {
    if (!user) {
      setAuthOpen(true);

      return;

    }


    if (user.role !== 'player') {
      notify('Запись доступна только игрокам');

      return;

    }


    if (!user.onboarding_complete) {
      notify('Сначала заполните анкету');

      return;

    }


    setDetailCourtId(preferredCourtId);


    try {
      const coach = await api<Coach>(
        `/coaches/${id}`, {}, false
      );

      setDetail(coach);

    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));

    }
  }


  function refreshAfterBooking() {
    setDetail(null);
    notify('Предварительная запись создана. Теперь подтвердите корт.');
    navigate('bookings');
    void loadBookings();
    void loadPublic()
  }

  async function doBookingAction(path: string) {
    try {
      await post(path);
      await loadBookings();
      notify('Статус записи обновлён');
      void loadPublic()
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e))
    }
  }

  async function doConfirm(code: string) {
    if (!confirm) return;
    try {
      await post(`/bookings/${confirm.id}/court-confirm`, { confirmation_code: code });
      setConfirm(null);
      await loadBookings();
      notify('Корт подтверждён. Тренировка запланирована!')
    } catch (e) {
      throw e
    }
  }

  async function addSlot(e: FormEvent) {
    e.preventDefault();
    setSlotBusy(true);
    try {
      const created = await post<{ created: string[] }>('/coach/slots', { starts_at: `${slotDate}T${slotTime}`, duration_minutes: 60, repeat_weeks: repeat });
      notify(`Добавлено окон: ${created.created.length}`);
      await loadMine()
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e))
    } finally {
      setSlotBusy(false)
    }
  }

  async function removeSlot(id: number) {
    try {
      await api(`/coach/slots/${id}`, { method: 'DELETE' });
      await loadMine();
      notify('Окно удалено')
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e))
    }
  }

  async function approveCoach(id: number) {
    try {
      await post(`/admin/coaches/${id}/verify`);
      setPending(p => p.filter(c => c.id !== id));
      notify('Анкета тренера проверена');
      void loadPublic()
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e))
    }
  }


  const coachInitial: CoachForm | undefined = mine?.profile && mine.settings ? {
    headline: mine.profile.headline, bio: mine.profile.bio, sports: mine.profile.sports, levels: mine.profile.levels, experience_years: mine.profile.experience_years,
    certificates: String(mine.settings.certificates || ''), telegram: String(mine.settings.telegram || ''), phone: String(mine.settings.phone || ''), photo_data_url: String(mine.settings.photo_data_url || ''),
    formats: mine.profile.formats, price: mine.profile.price, split_price: mine.profile.split_price, group_price: mine.profile.group_price,
    duration_minutes: Number(mine.settings.duration_minutes || 60), court_ids: mine.courts, ntrp: mine.profile.ntrp,
    cancellation_policy: mine.profile.cancellation_policy, invite_code: String(mine.settings.invite_code || '')  
} : undefined;


  const filteredCourts = useMemo(() => courts.filter(c => (!sport || c.sport === sport) && (district === 'Любой район' || c.district === district)).sort((a, b) => sort === 'price' ? a.price - b.price : sort === 'court_price' ? a.price - b.price : a.district.localeCompare(b.district, 'ru')), [courts, sport, district, sort]);

  return <div className="app">
    <header className="header">
      <div className="container header-inner">
        <Brand go={() => navigate('home')} />
        <nav className={`nav ${mobileMenu ? 'nav-open' : ''}`}>
          <button className={page === 'feed' ? 'active' : ''} onClick={() => navigate('feed')}>Найти тренировку</button>
          <button className={page === 'courts' ? 'active' : ''} onClick={() => navigate('courts')}>Корты</button>
          {user?.role === 'coach' && <button className={page === 'coach' ? 'active' : ''} onClick={() => navigate('coach')}>Кабинет тренера</button>}
          {user?.role === 'admin' && <button onClick={() => navigate('admin')}>Проверка тренеров</button>}
          {user?.role === 'player' && <button onClick={() => navigate('bookings')}>Мои записи</button>}
        </nav>
        <div className="header-actions">
          {user ? <><button className="account-button" onClick={() => navigate(user.role === 'coach' ? 'coach' : user.role === 'admin' ? 'admin' : 'profile')}>
            <UserRound size={17} />
            <span>
              {user.name.split(' ')[0]}
            </span>
          </button><button title="Выйти" className="exit-button" onClick={logout}>
              <LogOut size={17} />
            </button></> : <><button className="header-login" onClick={() => setAuthOpen(true)}>Войти</button><Button onClick={() => setAuthOpen(true)}>Регистрация <ArrowRight size={16} /></Button></>}
          <button className="hamburger" onClick={() => setMobileMenu(v => !v)} aria-label="Меню">
            <Menu />
          </button>
        </div>
      </div>
    </header>
    {page === 'home' && <><section className="hero">
      <div className="container hero-content">
        <div className="hero-text">
          <span className="kicker kicker-light"><span className="kicker-ball" /> ТВОЯ ИГРА НАЧИНАЕТСЯ ЗДЕСЬ</span>
          <h1>FitSpot<span className="point">.</span></h1>
          <h2>Сервис подбора тренировок</h2>
          <p>Теннис и падел без сложного поиска. Выбери тренера, корт и время — всё в одном месте.</p>
          <div className="hero-buttons">
            <Button onClick={() => navigate('feed')}>Найти тренировку <ArrowUpRight size={18} /></Button>
            <Button ghost onClick={() => navigate('courts')}>Посмотреть корты</Button>
          </div>
          <div className="hero-pills">
            <span>🎾 Большой теннис</span>
            <span>🏓 Падел</span>
            <span>✓ Онлайн-запись</span>
          </div>
        </div>
        <Rackets />
      </div>
    </section><section className="container section home-section">
        <div className="section-head">
          <div>
            <span className="kicker">ПРОСТО И ПОНЯТНО</span>
            <h2>Три шага до корта</h2>
          </div>
        </div>
        <div className="steps">
          <div>
            <span>01</span>
            <h3>Заполни анкету</h3>
            <p>Укажи уровень, район и удобное время для занятий.</p>
          </div>
          <div>
            <span>02</span>
            <h3>Выбери вариант</h3>
            <p>Сравни тренеров, корты и общую стоимость.</p>
          </div>
          <div>
            <span>03</span>
            <h3>Запишись</h3>
            <p>Выбери слот и подтверди бронь корта.</p>
          </div>
        </div>
      </section><section className="section pale">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="kicker">НАШИ ТРЕНЕРЫ</span>
              <h2>Найди своего тренера</h2>
            </div>
            <button className="text-arrow" onClick={() => navigate('feed')}>Все варианты <ArrowUpRight size={19} /></button>
          </div>
          <div className="coach-grid">
            {coaches.slice(0, 3).map(c => <CoachCard key={c.id} coach={c} onClick={() => void openDetail(c.id)} />)}
          </div>
        </div>
      </section><section className="container cta-section">
        <div className="cta">
          <span className="kicker">ГОТОВ К ТРЕНИРОВКЕ?</span>
          <h2>Увидимся на корте.</h2>
          <p>Выбирай время и начинай играть.</p>
          <Button onClick={() => navigate('feed')}>Подобрать тренировку <ArrowRight size={17} /></Button>
        </div>
      </section></>}

    {(page === 'feed' || page === 'courts') && (
      <main className="list-page">
        <div className="container">
          <div className="page-title">
            <span className="kicker">FITSPOT / ПОИСК</span>
            <h1>
              {page === 'feed'
                ? 'Подобрать тренировку'
                : 'Каталог кортов'}
            </h1>
            <p>
              {page === 'feed'
                ? 'Выбери тренера, затем подходящий корт и время.'
                : '100 демонстрационных кортов по Москве.'}
            </p>
          </div>

          <div className="filters">
            <div className="filter-label">
              <Filter size={18} /> Фильтры
            </div>

            <div className="filter-sports">
              <button
                className={!sport ? 'selected' : ''}
                onClick={() => setSport('')}
              >Все</button>
              <button
                className={sport === 'tennis' ? 'selected' : ''}
                onClick={() => setSport('tennis')}
              >🎾 Теннис</button>
              <button
                className={sport === 'padel' ? 'selected' : ''}
                onClick={() => setSport('padel')}
              >🏓 Падел</button>
            </div>

            {page === 'feed' ? (
              <>
                <DistrictPicker
                  selected={feedDistricts}
                  onChange={setFeedDistricts}
                />

                <input
                  className="filter-date"
                  aria-label="Дата занятия"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />

                <select
                  aria-label="Время суток"
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                >
                  <option value="">Любое время</option>
                  <option value="morning">До 12:00</option>
                  <option value="afternoon">12:00–17:00</option>
                  <option value="evening">После 17:00</option>
                </select>
              </>
            ) : (
              <select
                aria-label="Район"
                value={district}
                onChange={e => setDistrict(e.target.value)}
              >
                {districts.map(v => (
                  <option key={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="Сортировка"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              {page === 'feed' ? (
                <>
                  <option value="recommended">Рекомендуемые</option>
                  <option value="price">Сначала дешевле</option>
                  <option value="rating">По рейтингу</option>
                  <option value="time">Ближайшее время</option>
                  <option value="court_price">Дешевле корт</option>
                </>
              ) : (
                <>
                  <option value="recommended">По району</option>
                  <option value="court_price">Сначала дешевле</option>
                </>
              )}
            </select>
          </div>

          {page === 'feed' ? (
            loading ? <Spin /> : err ? <Alert text={err} /> : (
              <>
                <div className="result-count">
                  Найдено тренеров: <b>
                    {feed.length}
                  </b>
                </div>

                <div className="offers-grid">
                  {feed.map((offer, index) => {
                    const options = offer.court_options;


                    const selected = options.find(
                      x => x.court.id ===
                        selectedCourtByCoach[offer.coach.id]
                    ) ?? options[0];


                    if (!selected) return null;


                    return (
                      <article
                        key={offer.coach.id}
                        className="offer"
                      >
                        <div className="offer-label">
                          #{index + 1} ·{' '}
                          {offer.coach.sports.map(sportLabel).join(', ')}
                        </div>

                        <div className="offer-user">
                          <IconAvatar
                            emoji={offer.coach.emoji}
                            color={offer.coach.color}
                            size="avatar-small"
                          />
                          <div>
                            <h3>
                              {offer.coach.name}
                            </h3>
                            <p>
                              <Star size={13} fill="currentColor" />
                              {offer.coach.rating.toFixed(1)} ·{' '}
                              {offer.coach.experience_years} лет опыта
                            </p>
                            {offer.coach.ntrp && (
                              <p>NTRP {offer.coach.ntrp}</p>
                            )}
                          </div>
                        </div>

                        <label className="field">
                          Выберите корт
                          <select
                            value={selected.court.id}
                            onChange={e => {
                              setSelectedCourtByCoach(prev => ({
                                ...prev,
                                [offer.coach.id]: Number(e.target.value),
                              }));

                            }}
                          >
                            {options.map(option => (
                              <option
                                key={option.court.id}
                                value={option.court.id}
                              >
                                {option.court.club} · {option.court.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="offer-detail">
                          <MapPin size={16} />
                          <span>
                            {selected.court.district}
                          </span>
                        </div>

                        <div className="offer-detail">
                          <CalendarDays size={16} />
                          <span>
                            Ближайшее время: {dt(selected.slot.starts_at)} МСК
                          </span>
                        </div>

                        <div className="offer-pricing">
                          <span>
                            Тренер: {price(offer.coach.price)}
                            <br />
                            Корт: {price(selected.court.price)}
                          </span>
                          <strong>
                            {price(
                              offer.coach.price + selected.court.price
                            )}
                          </strong>
                        </div>

                        <Button
                          className="full"
                          onClick={() => void openDetail(
                            offer.coach.id,
                            selected.court.id
                          )}
                        >
                          Посмотреть и записаться
                          <ArrowRight size={16} />
                        </Button>
                      </article>
                    );

                  })}
                </div>

                {!feed.length && (
                  <Empty text="По этим фильтрам тренировок нет">
                    <button
                      className="link-text"
                      onClick={() => {
                        setSport('');

                        setFeedDistricts([]);

                        setDate('');

                        setPeriod('');

                      }}
                    >
                      Сбросить фильтры
                    </button>
                  </Empty>
                )}
              </>
            )
          ) : (
            <>
              <div className="result-count">
                Кортов: <b>
                  {filteredCourts.length}
                </b>
              </div>
              <div className="court-grid">
                {filteredCourts.map(c => (
                  <CourtCard key={c.id} court={c} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    )}

    {page === 'bookings' && <main className="list-page">
      <div className="container">
        <div className="page-title">
          <span className="kicker">ЛИЧНЫЙ КАБИНЕТ</span>
          <h1>
            {user?.role === 'coach' ? 'Заявки учеников' : 'Мои записи'}
          </h1>
          <p>Управляй тренировками и бронированием кортов.</p>
        </div>
        {!user ? <Empty text="Войди в аккаунт">
          <Button onClick={() => setAuthOpen(true)}>Войти</Button>
        </Empty> : loading ? <Spin /> : <>{bookings.length === 0 ? <Empty text="Пока записей нет">
          <Button onClick={() => navigate('feed')}>Найти тренировку</Button>
        </Empty> : <div className="booking-list">
          {bookings.map(b => <div className="booking-item" key={b.id}>
            <div className="booking-icon">
              {b.sport === 'tennis' ? '🎾' : '🏓'}
            </div>
            <div className="booking-info">
              <div className="booking-title">
                <h3>
                  {user?.role === 'coach' ? b.player_name : b.coach_name}
                </h3>
                <span className={`status status-${b.status}`}>
                  {bookingTitles[b.status] || b.status}
                </span>
              </div>
              <p><CalendarDays size={16} />{dt(b.starts_at)} МСК</p>
              <p><MapPin size={16} />{b.court?.club} · {b.court?.name}</p>
              <p>Корт бронирует: {b.court_booker === 'coach' ? 'тренер' : 'игрок'} · Занятие: {price(b.price)} · Корт: {price(b.court_price)}</p>
              <p className="muted">Цель: {b.objective}. {b.need_racket ? 'Нужна ракетка. ' : ''}{b.comment || ''}</p>
              {b.court_confirmation_code && <p className="success">Подтверждение брони: {b.court_confirmation_code}</p>}
            </div>
            <div className="booking-buttons">
              {user?.role === 'player' && b.status !== 'cancelled' && (
                <Button
                  ghost
                  onClick={() => void showCoachContact(
                    b.coach_id,
                    b.coach_name
                  )}
                >
                  Контакты тренера
                </Button>
              )}
              {b.status === 'awaiting_court' && ((b.court_booker === 'coach' && user.role === 'coach') || (b.court_booker === 'player' && user.role === 'player')) && <Button onClick={() => setConfirm(b)}><Check size={16} /> Подтвердить корт</Button>}{b.status === 'confirmed' && user.role === 'coach' && <><Button onClick={() => void doBookingAction(`/bookings/${b.id}/complete`)}><Check size={16} /> Проведена</Button><Button ghost onClick={() => void doBookingAction(`/bookings/${b.id}/no-show`)}>Неявка</Button></>}{['awaiting_court', 'confirmed'].includes(b.status) && <button className="link-danger" onClick={() => void doBookingAction(`/bookings/${b.id}/cancel`)}>Отменить запись</button>}</div>
          </div>)}
        </div>}<Banner title="Без оплаты и интеграции с клубами">Запись и статусы действительно сохраняются в базе. Для подтверждения корта используется условный номер, без обращения к сайту клуба.</Banner></>}
      </div>
    </main>}
    {page === 'coach' && <main className="list-page">
      <div className="container">
        <div className="page-title">
          <span className="kicker">КАБИНЕТ ТРЕНЕРА</span>
          <h1>Мои тренировки</h1>
          <p>Профиль, клубы, свободное время и заявки учеников.</p>
        </div>
        {user?.role !== 'coach' ? <Empty text="Раздел для тренеров">
          <Button onClick={() => setAuthOpen(true)}>Зарегистрироваться как тренер</Button>
        </Empty> : <><div className="coach-dashboard-top">
          <div className="dashboard-stat">
            <span>Статус профиля</span>
            <strong>
              {user.verified ? 'Проверен' : 'На проверке'}
            </strong>
            <small>
              {user.verified ? 'Виден игрокам в поиске' : 'В поиске появится после проверки'}
            </small>
          </div>
          <div className="dashboard-stat">
            <span>Свободных окон</span>
            <strong>
              {mine?.slots.filter(s => s.available).length || 0}
            </strong>
            <small>На ближайшие даты</small>
          </div>
          <div className="dashboard-stat">
            <span>Рабочих кортов</span>
            <strong>
              {mine?.courts.length || 0}
            </strong>
            <small>Выбрано в анкете</small>
          </div>
        </div><div className="dashboard-grid">
            <div className="panel">
              <div className="panel-heading">
                <h2>Мой профиль</h2>
                <button className="link-text" onClick={() => setEditCoach(true)}>Редактировать</button>
              </div>
              <p>
                {mine?.profile?.headline}
              </p>
              <p className="muted">
                {mine?.profile?.bio}
              </p>
              <div className="meta-row"><Trophy size={18} />{mine?.profile?.experience_years} лет опыта</div>
              <div className="meta-row">
                <MapPin size={18} />
                {mine?.profile?.districts.join(', ')}
              </div>
              <div className="meta-row"><Settings2 size={18} />Корт бронирует: {mine?.profile?.court_booker === 'coach' ? 'тренер' : 'ученик'}</div>
              <div className="meta-row">Тренировка 1:1: <b>
                {price(mine?.profile?.price || 0)}
              </b></div>
              <Banner title="Проверка профиля">Новые профили проверяет администратор FitSpot. На демонстрации для этого есть отдельный админ-кабинет.</Banner>
            </div>
            <div className="panel">
              <div className="panel-heading">
                <h2>Открыть свободное окно</h2>
                <Clock size={19} />
              </div>
              <form className="form" onSubmit={addSlot}>
                <div className="form-grid">
                  <label className="field">Дата<input type="date" required min={nextDay()} value={slotDate} onChange={e => setSlotDate(e.target.value)} /></label>
                  <Select label="Время (МСК)" value={slotTime} set={setSlotTime}>
                    {['10:00', '11:00', '13:00', '14:00', '16:00', '17:00', '18:00', '19:00', '20:00'].map(t => <option key={t}>
                      {t}
                    </option>)}
                  </Select>
                </div>
                <Select label="Повторять по неделям" value={String(repeat)} set={v => setRepeat(Number(v))}>
                  {[1, 2, 3, 4, 6, 8].map(v => <option value={v} key={v}>{v} {v === 1 ? 'неделя' : 'недель'}</option>)}
                </Select>
                <Button type="submit" disabled={slotBusy} className="full"><Plus size={17} /> Открыть окно</Button>
                <p className="tiny muted">Открывая окно, ты заранее соглашаешься провести тренировку. Отдельного ручного подтверждения заявки нет.</p>
              </form>
            </div>
          </div><div className="panel slots-panel">
            <div className="panel-heading">
              <h2>Моё расписание</h2>
              <button className="link-text" onClick={() => navigate('bookings')}>Заявки учеников <ArrowRight size={15} /></button>
            </div>
            <div className="slot-items">
              {mine?.slots.filter(s => s.starts_at.slice(0, 10) >= nextDay()).slice(0, 30).map(s => <div key={s.id} className="slot-line">
                <span><CalendarDays size={15} />{dt(s.starts_at)} МСК</span>
                <span className={s.available ? 'success' : 'muted'}>
                  {s.available ? 'Свободно' : 'Занято'}
                </span>
                {s.available && <button onClick={() => void removeSlot(s.id)} title="Удалить время">
                  <Trash2 size={16} />
                </button>}
              </div>)}
              {!mine?.slots.length && <p>Слотов пока нет. Открой первое время выше.</p>}
            </div>
          </div></>}
      </div>
    </main>}
    {page === 'profile' && <main className="list-page">
      <div className="container">
        <div className="page-title">
          <span className="kicker">МОЙ FITSPOT</span>
          <h1>Личный кабинет</h1>
        </div>
        {user && <div className="profile-grid">
          <div className="panel profile-card">
            <div className="profile-avatar">
              {user.name[0]}
            </div>
            <h2>
              {user.name}
            </h2>
            <p>
              {user.email}
            </p>
            <span className="status status-confirmed">
              {user.role === 'player' ? 'Игрок' : user.role === 'coach' ? 'Тренер' : 'Администратор'}
            </span>
            <Button ghost onClick={logout}><LogOut size={16} /> Выйти</Button>
          </div>
          <div className="panel">
            <div className="panel-heading">
                <h2>Анкета игрока</h2>

                <button
                type="button"
                className="link-text"
                onClick={() => void openPlayerEdit()}
                disabled={playerEditLoading}
                >
                {playerEditLoading
                    ? 'Загружаем...'
                    : 'Редактировать'}
                </button>
            </div>
            <p><b>Спорт:</b> {sportLabel(user.sport)}</p>
            <p><b>Уровень:</b> {user.level}</p>
            <p><b>Опыт:</b> {user.experience}</p>
            <p><b>Район:</b> {user.district}</p>
            <p><b>Главный приоритет:</b> {user.priority}</p>
            <Button onClick={() => navigate('feed')}>Найти занятие <ArrowRight size={17} /></Button>
          </div>
        </div>}
      </div>
    </main>}
    {page === 'admin' && <main className="list-page">
      <div className="container">
        <div className="page-title">
          <span className="kicker">АДМИНИСТРИРОВАНИЕ</span>
          <h1>Проверка тренеров</h1>
          <p>Демонстрационная очередь новых анкет. Одобрение делает профиль видимым в поиске.</p>
        </div>
        {user?.role === 'admin' ? <div className="panel">
          {!pending.length ? <Empty text="Анкет на проверке нет" /> : pending.map(v => <div key={v.id} className="admin-line">
            <div className="admin-profile">
              {v.photo_data_url && <img src={v.photo_data_url} alt="Фото кандидата" />}
              <div>
                <b>
                  {v.name}
                </b>
                <p>
                  {v.headline}
                </p>
                <p>
                  {v.bio}
                </p>
                <p>Опыт: {v.experience_years} лет · Спорт: {v.sports.map(sportLabel).join(', ')} · Цена: {price(v.price)}</p>
                <p>Клуб: {v.club} · Telegram: {v.telegram}</p>
                <p>Сертификаты: {v.certificates || 'Не указаны'}</p>
              </div>
            </div>
            <Button disabled={!v.completed} onClick={() => void approveCoach(v.id)}>Одобрить <Check size={16} /></Button>
          </div>)}
        </div> : <Empty text="Нет прав администратора" />}
      </div>
    </main>}
    <footer className="footer">
      <div className="container footer-content">
        <Brand go={() => navigate('home')} />
        <p>Сервис подбора тренировок по теннису и паделу</p>
        <span>© 2026 FitSpot</span>
      </div>
    </footer>
    {authOpen && <Auth onClose={() => setAuthOpen(false)} onAuth={onAuth} />}
    {needsOnboarding && user?.role === 'player' && <PlayerOnboarding onDone={v => {
      setUser(v);
      notify('Анкета сохранена. Можешь выбирать тренировку!')
    }} onLogout={logout} />}
    {needsOnboarding && user?.role === 'coach' && <CoachOnboarding courts={courts} onDone={v => {
      setUser(v);
      navigate('coach');
      notify('Анкета отправлена на проверку');
      void loadMine()
    }} onLogout={logout} />}
    {editCoach && user?.role === 'coach' && user.onboarding_complete && <CoachOnboarding courts={courts} initial={coachInitial} onCancel={() => setEditCoach(false)} onLogout={logout} onDone={v => {
      setUser(v);
      setEditCoach(false);
      void loadMine();
      notify('Изменения отправлены на проверку')
    }} />}
    {editingQuestionnaire &&
    user?.role === 'player' &&
    user.onboarding_complete && (
        <PlayerOnboarding
        initial={editingQuestionnaire}
        onDone={savePlayerEdit}
        onCancel={() => setEditingQuestionnaire(null)}
        onLogout={logout}
        />
    )}
    {detail && (
      <Detail
        key={`${detail.id}-${detailCourtId ?? 'default'}`}
        coach={detail}
        initialCourtId={detailCourtId}
        needRacket={user?.has_racket === false}
        onClose={() => setDetail(null)}
        onCreated={refreshAfterBooking}
      />
    )}

    {confirm && <ConfirmCourt booking={confirm} onClose={() => setConfirm(null)} onConfirm={doConfirm} />}
    {toast && <div className="toast" role="status">
      <CheckCircle2 size={20} />
      {toast}
      <button onClick={() => setToast('')}>
        <X size={15} />
      </button>
    </div>}
    {coachContact && (
      <Modal
        title="Контакты тренера"
        onClose={() => setCoachContact(null)}
      >
        <div className="modal-heading">
          <span className="kicker">FITSPOT / КОНТАКТЫ</span>
          <h2>
            {coachContact.name}
          </h2>
          <p>Контакты доступны после записи на тренировку.</p>
        </div>

        <div className="form">
          <p>
            <b>Telegram:</b>{' '}
            {coachContact.telegram || 'Не указан'}
          </p>
          <p>
            <b>Телефон:</b>{' '}
            {coachContact.phone || 'Не указан'}
          </p>
        </div>
      </Modal>
    )}
  </div>;
}
export default App;
