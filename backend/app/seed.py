import os
import secrets
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .models import User, Coach, Slot, CoachSettings, Court, CoachCourt, CourtWindow, now_moscow
from .auth import hash_password

COACHES = [
    dict(name='Александр Морозов', headline='Теннис от первых ударов до уверенной игры', bio='Помогаю освоить подачу и уверенно чувствовать себя на корте. Работаю со взрослыми и подростками, подбираю нагрузку под цель ученика.', sports='tennis', districts='Хамовники, Пресня', experience_years=9, rating_x10=49, reviews=87, price=3200, color='#E6F0DD', emoji='🎾'),
    dict(name='Мария Волкова', headline='Падел для любого уровня', bio='Тренировки по паделу в комфортном темпе: работа у стекла, позиционирование и тактика парной игры. Подходит для начинающих.', sports='padel', districts='Пресня, Хорошёво', experience_years=6, rating_x10=50, reviews=64, price=3800, color='#F6E3D9', emoji='🏓'),
    dict(name='Дмитрий Соколов', headline='Техника, тактика и соревнования', bio='Профессиональный подход для игроков, которые хотят результата. Помогу подготовиться к турнирам и улучшить технику.', sports='tennis,padel', districts='Сокол, Аэропорт', experience_years=12, rating_x10=48, reviews=123, price=4500, color='#DDE8F7', emoji='🎾'),
    dict(name='Анна Белова', headline='Бережный старт в большом теннисе', bio='Спокойная и понятная подача материала, персональный план и упражнения для уверенного прогресса.', sports='tennis', districts='Таганский, Басманный', experience_years=7, rating_x10=49, reviews=52, price=2800, color='#F8E7B7', emoji='🎾'),
    dict(name='Марк Петров', headline='Падел от первых розыгрышей до побед', bio='Помогаю освоить парную тактику и регулярные занятия начинающим и продолжающим игрокам.', sports='padel', districts='Хамовники, Раменки', experience_years=5, rating_x10=48, reviews=46, price=3500, color='#E4E1F7', emoji='🏓'),
    dict(name='Екатерина Смирнова', headline='Теннис с удовольствием и прогрессом', bio='Персональная программа под ваши цели — освоить базу, вернуться в спорт после перерыва или играть увереннее.', sports='tennis,padel', districts='Арбат, Пресня', experience_years=8, rating_x10=49, reviews=94, price=3600, color='#D8EBE9', emoji='🎾'),
]

DISTRICTS = ['Хамовники','Пресня','Сокол','Арбат','Таганский','Басманный','Раменки','Аэропорт','Хорошёво','Мещанский']
# Fictional locations, not claims about real clubs. 10 clubs x 10 courts = 100.

def seed(db: Session):
    if db.scalar(select(func.count(Court.id))) == 0:
        for club_idx, district in enumerate(DISTRICTS):
            for court_no in range(1, 11):
                sport = 'tennis' if court_no <= 6 else 'padel'
                court = Court(
                    name=f'Корт №{court_no}', club=f'FitSpot Клуб {club_idx+1:02d} · {district}',
                    district=district, sport=sport, surface='Хард' if sport=='tennis' and court_no%2==0 else ('Грунт' if sport=='tennis' else 'Искусственная трава'),
                    indoor=(court_no % 3 != 0), price=(1200 + club_idx*80 + court_no*90 if sport=='tennis' else 1600+club_idx*70+court_no*80),
                    address=f'{district}, демонстрационная локация {club_idx+1}'
                )
                db.add(court)
        db.flush()
        today = now_moscow().date()
        courts = db.scalars(select(Court)).all()
        for court in courts:
            for d in range(0, 14):
                day = today + timedelta(days=d)
                for hour in (10,11,13,14,16,17,18,19,20):
                    when = datetime.combine(day, datetime.min.time()).replace(hour=hour)
                    if when > now_moscow():
                        db.add(CourtWindow(court_id=court.id, starts_at=when, available=True))
        db.commit()
    if db.scalar(select(func.count(Coach.id))) == 0:
        courts = db.scalars(select(Court)).all()
        for i, item in enumerate(COACHES):
            email = f'coach{i+1}@fitspot.local'
            user = User(name=item['name'], email=email, password_hash=hash_password(secrets.token_urlsafe(32) if os.getenv('ENVIRONMENT') == 'production' else 'Coach123!'), role='coach', sport=item['sports'].split(',')[0])
            db.add(user)
            db.flush()
            allowed_sports = item['sports'].split(',')
            relevant = [c for c in courts if c.sport in allowed_sports and c.district in item['districts'].split(', ')]
            chosen = relevant[:8] if relevant else [c for c in courts if c.sport in allowed_sports][:8]
            coach = Coach(user_id=user.id, club=chosen[0].club, verified=True, **{k:v for k,v in item.items() if k!='name'})
            db.add(coach)
            db.flush()
            settings = CoachSettings(user_id=user.id, completed=True, telegram=f'@fitspot_coach{i+1}', photo_data_url='',
                formats='individual,split,group' if i%2==0 else 'individual', court_booker='coach' if i%2 else 'player',
                split_price=2400, group_price=1300, duration_minutes=60,
                levels='Начинающий,Любитель,Продвинутый', cancellation_policy='Бесплатная отмена за 24 часа')
            db.add(settings)
            for court in chosen:
                db.add(CoachCourt(coach_id=coach.id, court_id=court.id))
            today = now_moscow().date()
            for d in range(0, 14):
                day = today+timedelta(days=d)
                for hour in (10,14,18):
                    when = datetime.combine(day, datetime.min.time()).replace(hour=hour)
                    if when > now_moscow():
                        db.add(Slot(coach_id=coach.id, starts_at=when, available=True))
        db.commit()
    # Backfill configuration when opening a database created by the previous MVP.
    courts = db.scalars(select(Court)).all()
    for c in db.scalars(select(Coach)).all():
        if not db.scalar(select(CoachSettings.id).where(CoachSettings.user_id==c.user_id)):
            db.add(CoachSettings(user_id=c.user_id,completed=True,telegram='@fitspot_demo',
                                 court_booker='player',formats='individual'))
        if not db.scalar(select(CoachCourt.id).where(CoachCourt.coach_id==c.id)):
            sports=c.sports.split(',')
            closest=[x for x in courts if x.sport in sports and x.district in c.districts.split(', ')]
            for court in closest[:8]:
                db.add(CoachCourt(coach_id=c.id,court_id=court.id))
    db.commit()
    if os.getenv('ENVIRONMENT') == 'production':
        # Production admin is provisioned ONLY from private Render environment variables.
        admin_email = os.getenv('ADMIN_EMAIL', '').strip().lower()
        admin_password = os.getenv('ADMIN_PASSWORD', '')
        if admin_email and len(admin_password) >= 12 and not db.scalar(select(User).where(User.email == admin_email)):
            db.add(User(name='Администратор FitSpot', email=admin_email,
                        password_hash=hash_password(admin_password), role='admin'))
            db.commit()
    elif not db.scalar(select(User).where(User.email == 'admin@fitspot.local')):
        db.add(User(name='Администратор FitSpot', email='admin@fitspot.local',
                    password_hash=hash_password('Admin123!'), role='admin'))
        db.commit()
