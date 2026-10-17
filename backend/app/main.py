import os
import base64
import binascii
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, update, func
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from .db import Base, engine, get_db, SessionLocal
from .models import (User, PlayerQuestionnaire, Coach, CoachSettings, Slot, Booking,
                     Court, CourtWindow, CoachCourt, CourtReservation, now_moscow, now_utc)
from .auth import validate_email, hash_password, verify_password, issue_token, current_user, SECRET
from .schemas import (RegisterIn, LoginIn, UserOut, TokenOut, QuestionnaireIn,
                      CoachOnboardingIn, SlotIn, BookingIn, ConfirmCourtIn)
from .seed import seed

@asynccontextmanager
async def lifespan(_app):
    if os.getenv('ENVIRONMENT') == 'production':
        if SECRET.startswith('local-fitspot') or len(SECRET) < 32:
            raise RuntimeError('Set a strong JWT_SECRET (32+ chars) before production deployment')
        if not os.getenv('DATABASE_URL', '').startswith(('postgres://', 'postgresql://', 'postgresql+psycopg://')):
            raise RuntimeError('Use persistent PostgreSQL DATABASE_URL in production, not SQLite')
    Base.metadata.create_all(engine)
    if os.getenv('SEED_DEMO', 'true').lower() == 'true':
        with SessionLocal() as db:
            seed(db)
    yield

app = FastAPI(title='FitSpot API', version='0.2.0', lifespan=lifespan)
origins = [x.strip() for x in os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['GET','POST','PUT','DELETE'], allow_headers=['Authorization','Content-Type'])

@app.get('/api/health')
def health():
    return {'status':'ok','app':'FitSpot','version':'0.2.0'}

def present_user(user: User):
    return {'id':user.id,'name':user.name,'email':user.email,'role':user.role,'sport':user.sport,
            'level':user.level,'district':user.district,'priority':user.priority,'experience':user.experience,
            'onboarding_complete': bool(user.questionnaire) if user.role=='player' else bool(user.coach_settings and user.coach_settings.completed),
            'verified': bool(user.coach_profile and user.coach_profile.verified) if user.role=='coach' else False}

def require_role(user, role):
    if user.role != role:
        raise HTTPException(403,'Этот раздел доступен только '+('игрокам' if role=='player' else 'тренерам' if role=='coach' else 'администратору'))

@app.post('/api/auth/register', status_code=201)
def register(data: RegisterIn, db: Session=Depends(get_db)):
    email=validate_email(data.email)
    if db.scalar(select(User).where(User.email==email)):
        raise HTTPException(409,'Этот email уже зарегистрирован')
    user=User(name=data.name.strip(),email=email,password_hash=hash_password(data.password),role=data.role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(409,'Этот email уже зарегистрирован')
    db.refresh(user)
    return {'access_token':issue_token(user),'user':present_user(user)}

@app.post('/api/auth/login')
def login(data: LoginIn, db: Session=Depends(get_db)):
    user=db.scalar(select(User).where(User.email==data.email.strip().lower()))
    if not user or not verify_password(data.password,user.password_hash):
        raise HTTPException(401,'Неправильный email или пароль')
    return {'access_token':issue_token(user),'user':present_user(user)}

@app.get('/api/auth/me')
def me(user: User=Depends(current_user)):
    return present_user(user)

@app.post('/api/player/questionnaire')
def questionnaire(data:QuestionnaireIn, db:Session=Depends(get_db), user:User=Depends(current_user)):
    require_role(user,'player')
    profile=user.questionnaire or PlayerQuestionnaire(user_id=user.id)
    for key,value in data.model_dump().items(): setattr(profile,key,value.strip())
    db.add(profile)
    for key in ('sport','experience','level','district','priority'): setattr(user,key,getattr(profile,key))
    db.commit(); db.refresh(user)
    return present_user(user)

@app.get('/api/player/questionnaire')
def get_questionnaire(user:User=Depends(current_user)):
    require_role(user,'player')
    if not user.questionnaire: raise HTTPException(404,'Анкета не заполнена')
    q=user.questionnaire
    return {key:getattr(q,key) for key in ('sport','experience','level','district','convenient_time','priority','goal')}

def court_out(c:Court):
    return {'id':c.id,'name':c.name,'club':c.club,'district':c.district,'sport':c.sport,
            'surface':c.surface,'indoor':c.indoor,'price':c.price,'address':c.address}

@app.get('/api/courts')
def courts(sport:str='',district:str='',limit:int=Query(120,ge=1,le=150),db:Session=Depends(get_db)):
    stmt=select(Court).order_by(Court.district,Court.club,Court.name)
    if sport: stmt=stmt.where(Court.sport==sport)
    if district and district!='Любой район': stmt=stmt.where(Court.district==district)
    return [court_out(c) for c in db.scalars(stmt.limit(limit)).all()]

@app.get('/api/courts/{court_id}/windows')
def court_windows(court_id:int,db:Session=Depends(get_db)):
    if not db.get(Court,court_id): raise HTTPException(404,'Корт не найден')
    slots=db.scalars(select(CourtWindow).where(CourtWindow.court_id==court_id,CourtWindow.available.is_(True),CourtWindow.starts_at>now_moscow()).order_by(CourtWindow.starts_at).limit(140)).all()
    return [{'id':s.id,'starts_at':s.starts_at.isoformat(timespec='minutes')} for s in slots]

def slot_out(s:Slot):
    return {'id':s.id,'starts_at':s.starts_at.isoformat(timespec='minutes'),'duration_minutes':s.duration_minutes,'available':s.available}

def coach_out(c:Coach,include_slots=False,db:Session|None=None):
    settings=c.user.coach_settings
    details={'id':c.id,'name':c.user.name,'headline':c.headline,'bio':c.bio,
            'sports':c.sports.split(','),'districts':[x.strip() for x in c.districts.split(',') if x.strip()],
            'club':c.club,'experience_years':c.experience_years,'rating':c.rating_x10/10,'reviews':c.reviews,
            'price':c.price,'color':c.color,'emoji':c.emoji,'verified':c.verified,
            'court_booker':settings.court_booker if settings else 'player',
            'levels':settings.levels.split(',') if settings else [],
            'formats':settings.formats.split(',') if settings else ['individual'],
            'split_price':settings.split_price if settings else 0,
            'group_price':settings.group_price if settings else 0,
            'cancellation_policy':settings.cancellation_policy if settings else 'Бесплатная отмена за 24 часа'}
    if include_slots and db:
        courtids=db.scalars(select(CoachCourt.court_id).where(CoachCourt.coach_id==c.id)).all()
        details['courts']=[court_out(r) for r in db.scalars(select(Court).where(Court.id.in_(courtids))).all()]
        details['slots']=[slot_out(s) for s in db.scalars(select(Slot).where(Slot.coach_id==c.id, Slot.available.is_(True),Slot.starts_at>now_moscow()).order_by(Slot.starts_at).limit(100)).all()]
    return details

@app.get('/api/coaches')
def coaches(sport:str='',district:str='',max_price:int|None=Query(None,ge=0),db:Session=Depends(get_db)):
    rows=db.scalars(select(Coach).where(Coach.verified.is_(True)).order_by(Coach.rating_x10.desc(),Coach.id)).all()
    return [coach_out(c) for c in rows if (not sport or sport in c.sports.split(',')) and
            (not district or district=='Любой район' or district in c.districts) and (max_price is None or c.price<=max_price)]

@app.get('/api/coaches/{coach_id}')
def coach_detail(coach_id:int,db:Session=Depends(get_db)):
    c=db.get(Coach,coach_id)
    if not c or not c.verified: raise HTTPException(404,'Тренер не найден')
    return coach_out(c,True,db)

@app.get('/api/feed')
def feed(sport:str='',district:str='',sort:str='recommended',date:str='',period:str='',limit:int=Query(36,ge=1,le=100),db:Session=Depends(get_db)):
    """Rank available coach+court combinations, never claim actual CRM availability."""
    valid={'recommended','price','rating','time','court_price'}
    if period not in ('','morning','afternoon','evening'):raise HTTPException(422,'Неизвестное время суток')
    if date:
        try: datetime.strptime(date,'%Y-%m-%d')
        except ValueError:raise HTTPException(422,'Неверная дата')
    if sort not in valid: raise HTTPException(422,'Неизвестная сортировка')
    coaches=db.scalars(select(Coach).where(Coach.verified.is_(True))).all()
    result=[]
    for coach in coaches:
        if sport and sport not in coach.sports.split(','): continue
        slots=db.scalars(select(Slot).where(Slot.coach_id==coach.id,Slot.available.is_(True),Slot.starts_at>now_moscow()).order_by(Slot.starts_at).limit(35)).all()
        if date:slots=[v for v in slots if v.starts_at.date().isoformat()==date]
        if period=='morning':slots=[v for v in slots if v.starts_at.hour<12]
        if period=='afternoon':slots=[v for v in slots if 12<=v.starts_at.hour<17]
        if period=='evening':slots=[v for v in slots if v.starts_at.hour>=17]
        if not slots: continue
        ids=db.scalars(select(CoachCourt.court_id).where(CoachCourt.coach_id==coach.id)).all()
        linked=db.scalars(select(Court).where(Court.id.in_(ids))).all()
        for court in linked:
            if sport and court.sport!=sport: continue
            if court.sport not in coach.sports.split(','): continue
            if district and district!='Любой район' and court.district!=district:continue
            starts=[s.starts_at for s in slots]
            cw=db.scalar(select(CourtWindow).where(CourtWindow.court_id==court.id,CourtWindow.starts_at.in_(starts),CourtWindow.available.is_(True)).order_by(CourtWindow.starts_at).limit(1))
            if not cw:continue
            matching=next(s for s in slots if s.starts_at==cw.starts_at)
            result.append({'coach':coach_out(coach),'court':court_out(court),'slot':slot_out(matching),
                           'total_price':coach.price+court.price})
    if sort=='price': key=lambda v:(v['total_price'],v['slot']['starts_at'])
    elif sort=='court_price': key=lambda v:(v['court']['price'],v['total_price'])
    elif sort=='rating': key=lambda v:(-v['coach']['rating'],v['total_price'])
    elif sort=='time': key=lambda v:(v['slot']['starts_at'],v['total_price'])
    else: key=lambda v:(-v['coach']['rating']*700+v['total_price']*.15,v['slot']['starts_at'])
    return sorted(result,key=key)[:limit]

@app.get('/api/coaches/{coach_id}/slots/{slot_id}/courts')
def available_courts(coach_id:int,slot_id:int,db:Session=Depends(get_db)):
    slot=db.get(Slot,slot_id)
    if not slot or slot.coach_id!=coach_id:raise HTTPException(404,'Время не найдено')
    ids=db.scalars(select(CoachCourt.court_id).where(CoachCourt.coach_id==coach_id)).all()
    windows=db.scalars(select(CourtWindow).where(CourtWindow.court_id.in_(ids),CourtWindow.starts_at==slot.starts_at,CourtWindow.available.is_(True))).all()
    return [court_out(db.get(Court,w.court_id)) for w in windows]

def get_own_coach(user:User,db:Session)->Coach:
    require_role(user,'coach')
    coach=db.scalar(select(Coach).where(Coach.user_id==user.id))
    if not coach:raise HTTPException(409,'Сначала заполните анкету тренера')
    return coach

def validate_photo(data:str):
    if not data.startswith('data:image/jpeg;base64,') and not data.startswith('data:image/png;base64,') and not data.startswith('data:image/webp;base64,'):
        raise HTTPException(422,'Загрузите фотографию в JPG, PNG или WEBP')
    try: photo_bytes=base64.b64decode(data.split(',',1)[1],validate=True)
    except (ValueError,binascii.Error):raise HTTPException(422,'Некорректное изображение')
    if not 0<len(photo_bytes)<=250000:raise HTTPException(422,'Фото должно быть не больше 250 КБ')
    if data.startswith('data:image/jpeg') and not photo_bytes.startswith(b'\xff\xd8\xff'):
        raise HTTPException(422,'Некорректный JPG')
    if data.startswith('data:image/png') and not photo_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        raise HTTPException(422,'Некорректный PNG')
    if data.startswith('data:image/webp') and not (photo_bytes.startswith(b'RIFF') and photo_bytes[8:12]==b'WEBP'):
        raise HTTPException(422,'Некорректный WEBP')

@app.post('/api/coach/onboarding')
def coach_onboarding(data:CoachOnboardingIn,db:Session=Depends(get_db),user:User=Depends(current_user)):
    require_role(user,'coach')
    validate_photo(data.photo_data_url)
    court_ids=set(data.court_ids)
    courts=db.scalars(select(Court).where(Court.id.in_(court_ids))).all()
    if len(courts)!=len(court_ids):raise HTTPException(422,'Один из клубов или кортов не найден')
    if any(c.sport not in data.sports for c in courts):raise HTTPException(422,'Спорт кортов не совпадает с вашей специализацией')
    coach=user.coach_profile or Coach(user_id=user.id)
    coach.headline=data.headline.strip(); coach.bio=data.bio.strip(); coach.sports=','.join(data.sports)
    coach.districts=', '.join(sorted(set(c.district for c in courts)))
    coach.club=courts[0].club; coach.experience_years=data.experience_years; coach.price=data.price
    coach.emoji='🎾' if data.sports[0]=='tennis' else '🏓'
    coach.verified=False
    db.add(coach);db.flush()
    settings=user.coach_settings or CoachSettings(user_id=user.id)
    for key in ('telegram','phone','photo_data_url','certificates','split_price','group_price','duration_minutes','court_booker','cancellation_policy','invite_code'):
        setattr(settings,key,getattr(data,key))
    settings.completed=True; settings.levels=','.join(data.levels); settings.formats=','.join(data.formats)
    db.add(settings)
    for row in db.scalars(select(CoachCourt).where(CoachCourt.coach_id==coach.id)).all():db.delete(row)
    db.flush()
    for court in courts: db.add(CoachCourt(coach_id=coach.id,court_id=court.id))
    user.sport=data.sports[0];db.commit()
    db.expire(user,['coach_settings','coach_profile'])
    return present_user(user)

@app.get('/api/coach/me')
def coach_me(db:Session=Depends(get_db),user:User=Depends(current_user)):
    require_role(user,'coach')
    if not user.coach_profile:return {'profile':None,'settings':None,'courts':[],'slots':[]}
    c=user.coach_profile; settings=user.coach_settings
    court_ids=db.scalars(select(CoachCourt.court_id).where(CoachCourt.coach_id==c.id)).all()
    return {'profile':coach_out(c,True,db),'settings':{key:getattr(settings,key) for key in
            ('telegram','phone','photo_data_url','levels','certificates','formats','split_price','group_price','duration_minutes','court_booker','cancellation_policy','invite_code')},
            'courts':court_ids,'slots':[slot_out(s) for s in db.scalars(select(Slot).where(Slot.coach_id==c.id).order_by(Slot.starts_at.desc()).limit(90)).all()]}

@app.post('/api/coach/slots',status_code=201)
def create_slots(data:SlotIn,db:Session=Depends(get_db),user:User=Depends(current_user)):
    coach=get_own_coach(user,db)
    if not user.coach_settings or not user.coach_settings.completed:raise HTTPException(409,'Завершите анкету тренера')
    try: when=datetime.fromisoformat(data.starts_at)
    except ValueError:raise HTTPException(422,'Некорректная дата')
    if when.tzinfo is not None:raise HTTPException(422,'Укажите московское локальное время без часового пояса')
    if when<=now_moscow():raise HTTPException(422,'Время должно быть в будущем')
    created=[]
    linked_courts=db.scalars(select(CoachCourt.court_id).where(CoachCourt.coach_id==coach.id)).all()
    for week in range(data.repeat_weeks):
        start=when+timedelta(weeks=week)
        if not db.scalar(select(Slot).where(Slot.coach_id==coach.id,Slot.starts_at==start)):
            slot=Slot(coach_id=coach.id,starts_at=start,duration_minutes=data.duration_minutes)
            db.add(slot);created.append(start.isoformat(timespec='minutes'))
            # Demo court calendars expand as the trainer opens future dates.
            for court_id in linked_courts:
                if not db.scalar(select(CourtWindow.id).where(CourtWindow.court_id==court_id,CourtWindow.starts_at==start)):
                    db.add(CourtWindow(court_id=court_id,starts_at=start,available=True))
    db.commit()
    return {'created':created}

@app.delete('/api/coach/slots/{slot_id}')
def delete_slot(slot_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    coach=get_own_coach(user,db);slot=db.get(Slot,slot_id)
    if not slot or slot.coach_id!=coach.id:raise HTTPException(404,'Время не найдено')
    if db.scalar(select(Booking.id).where(Booking.slot_id==slot_id,Booking.status!='cancelled')):
        raise HTTPException(409,'Нельзя удалить время с активной записью')
    db.delete(slot);db.commit();return {'ok':True}

def booking_out(b:Booking):
    coach=b.slot.coach;settings=coach.user.coach_settings
    r=b.reservation
    court=r.court_window.court if r else None
    return {'id':b.id,'status':b.status,'starts_at':b.slot.starts_at.isoformat(timespec='minutes'),
            'duration_minutes':b.slot.duration_minutes,'coach_id':coach.id,'coach_name':coach.user.name,
            'player_name':b.player.name,'club':court.club if court else coach.club,'sport':court.sport if court else coach.sports.split(',')[0],
            'price':coach.price,'court_price':court.price if court else 0,'court':court_out(court) if court else None,
            'court_booker':settings.court_booker if settings else 'player','court_confirmation_code':r.confirmation_code if r else '',
            'objective':b.objective,'experience':b.experience,'need_racket':b.need_racket,'comment':b.comment,
            'created_at':b.created_at.isoformat(timespec='minutes')}

@app.post('/api/bookings',status_code=201)
def book(data:BookingIn,db:Session=Depends(get_db),user:User=Depends(current_user)):
    require_role(user,'player')
    if not user.questionnaire:raise HTTPException(409,'Сначала заполните анкету игрока')
    slot=db.get(Slot,data.slot_id)
    if not slot or slot.starts_at<=now_moscow():raise HTTPException(404,'Время больше недоступно')
    coach=db.get(Coach,slot.coach_id)
    if not coach.verified:raise HTTPException(409,'Профиль тренера ещё не проверен')
    linked=db.scalar(select(CoachCourt).where(CoachCourt.coach_id==coach.id,CoachCourt.court_id==data.court_id))
    if not linked:raise HTTPException(422,'Этот тренер не работает на выбранном корте')
    court=db.get(Court,data.court_id)
    if court.sport not in coach.sports.split(','):raise HTTPException(422,'Неверный вид спорта')
    window=db.scalar(select(CourtWindow).where(CourtWindow.court_id==court.id,CourtWindow.starts_at==slot.starts_at))
    if not window:raise HTTPException(409,'На это время нет доступного корта')
    sl=db.execute(update(Slot).where(Slot.id==slot.id,Slot.available.is_(True)).values(available=False))
    if sl.rowcount!=1:db.rollback();raise HTTPException(409,'Время тренера уже занято')
    cw=db.execute(update(CourtWindow).where(CourtWindow.id==window.id,CourtWindow.available.is_(True)).values(available=False))
    if cw.rowcount!=1:db.rollback();raise HTTPException(409,'Корт на это время уже выбран. Возьмите другой')
    booking=Booking(slot_id=slot.id,player_id=user.id,status='awaiting_court',objective=data.objective,
                    experience=data.experience or user.experience,need_racket=data.need_racket,comment=data.comment)
    db.add(booking);db.flush()
    db.add(CourtReservation(booking_id=booking.id,court_window_id=window.id))
    db.commit()
    return {'id':booking.id,'status':booking.status,'message':'Предварительная запись создана, подтвердите бронь корта'}

@app.get('/api/bookings/my')
def my_bookings(db:Session=Depends(get_db),user:User=Depends(current_user)):
    if user.role not in ('player','coach'):raise HTTPException(403,'Нет доступа')
    query=select(Booking).order_by(Booking.created_at.desc())
    if user.role=='coach':
        query=query.join(Booking.slot).join(Slot.coach).where(Coach.user_id==user.id)
    else:query=query.where(Booking.player_id==user.id)
    return [booking_out(b) for b in db.scalars(query).all()]

def accessible_booking(booking_id:int,db:Session,user:User):
    booking=db.get(Booking,booking_id)
    if not booking:raise HTTPException(404,'Запись не найдена')
    coach=db.get(Coach,booking.slot.coach_id)
    if user.id not in (booking.player_id,coach.user_id):raise HTTPException(403,'Нет доступа к чужой записи')
    return booking,coach

@app.post('/api/bookings/{booking_id}/court-confirm')
def confirm_court(booking_id:int,data:ConfirmCourtIn,db:Session=Depends(get_db),user:User=Depends(current_user)):
    booking,coach=accessible_booking(booking_id,db,user)
    if booking.status!='awaiting_court':raise HTTPException(409,'Подтверждение сейчас недоступно')
    booker=coach.user.coach_settings.court_booker
    expected_user=coach.user_id if booker=='coach' else booking.player_id
    if user.id!=expected_user:raise HTTPException(403,'Корт должен подтвердить тот, кто его бронирует')
    booking.reservation.confirmation_code=data.confirmation_code.strip()
    booking.reservation.confirmed_by=booker
    booking.reservation.confirmed_at=now_utc()
    booking.status='confirmed';db.commit()
    return {'id':booking.id,'status':booking.status}

@app.post('/api/bookings/{booking_id}/complete')
def complete_booking(booking_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    booking,coach=accessible_booking(booking_id,db,user)
    if user.id!=coach.user_id:raise HTTPException(403,'Отметку о тренировке делает тренер')
    if booking.status!='confirmed':raise HTTPException(409,'Нужна подтверждённая запись')
    # The local demo allows completion of a future slot to present the complete workflow.
    booking.status='completed';db.commit()
    return {'id':booking.id,'status':booking.status}

@app.post('/api/bookings/{booking_id}/no-show')
def no_show(booking_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    booking,coach=accessible_booking(booking_id,db,user)
    if user.id!=coach.user_id:raise HTTPException(403,'Отметку делает тренер')
    if booking.status!='confirmed':raise HTTPException(409,'Нужна подтверждённая запись')
    booking.status='no_show';db.commit();return {'id':booking.id,'status':booking.status}

@app.post('/api/bookings/{booking_id}/cancel')
def cancel_booking(booking_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    booking,_=accessible_booking(booking_id,db,user)
    if booking.status not in ('awaiting_court','confirmed'):
        raise HTTPException(409,'Эту запись уже нельзя отменить')
    booking.status='cancelled';booking.slot.available=True
    if booking.reservation:booking.reservation.court_window.available=True
    db.commit();return {'id':booking.id,'status':booking.status}

@app.get('/api/admin/pending')
def admin_pending(db:Session=Depends(get_db),user:User=Depends(current_user)):
    require_role(user,'admin')
    pending=db.scalars(select(Coach).where(Coach.verified.is_(False))).all()
    return [{'id':c.id,'name':c.user.name,'headline':c.headline,'bio':c.bio,'sports':c.sports.split(','),
             'price':c.price,'experience_years':c.experience_years,'completed':bool(c.user.coach_settings and c.user.coach_settings.completed),
             'certificates':c.user.coach_settings.certificates if c.user.coach_settings else '',
             'photo_data_url':c.user.coach_settings.photo_data_url if c.user.coach_settings else '',
             'telegram':c.user.coach_settings.telegram if c.user.coach_settings else '',
             'club':c.club} for c in pending]

@app.post('/api/admin/coaches/{coach_id}/verify')
def verify_coach(coach_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    require_role(user,'admin');coach=db.get(Coach,coach_id)
    if not coach:raise HTTPException(404,'Тренер не найден')
    if not coach.user.coach_settings or not coach.user.coach_settings.completed:raise HTTPException(409,'Анкета не заполнена')
    coach.verified=True;db.commit();return {'verified':True}
