from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import String, ForeignKey, Integer, DateTime, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

def now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)

def now_moscow():
    return datetime.now(ZoneInfo('Europe/Moscow')).replace(tzinfo=None)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default='player')
    sport: Mapped[str] = mapped_column(String(20), default='tennis')
    level: Mapped[str] = mapped_column(String(50), default='Начинающий')
    district: Mapped[str] = mapped_column(String(100), default='Любой район')
    priority: Mapped[str] = mapped_column(String(50), default='Удобное время')
    experience: Mapped[str] = mapped_column(String(100), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    coach_profile: Mapped['Coach | None'] = relationship(back_populates='user', uselist=False)
    questionnaire: Mapped['PlayerQuestionnaire | None'] = relationship(back_populates='user', uselist=False)
    coach_settings: Mapped['CoachSettings | None'] = relationship(back_populates='user', uselist=False)

class PlayerQuestionnaire(Base):
    __tablename__ = 'player_questionnaires'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), unique=True)
    sport: Mapped[str] = mapped_column(String(20))
    experience: Mapped[str] = mapped_column(String(120))
    level: Mapped[str] = mapped_column(String(60))
    district: Mapped[str] = mapped_column(String(100))
    convenient_time: Mapped[str] = mapped_column(String(80))
    priority: Mapped[str] = mapped_column(String(80))
    goal: Mapped[str] = mapped_column(String(150))
    user: Mapped[User] = relationship(back_populates='questionnaire')

class Coach(Base):
    __tablename__ = 'coaches'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), unique=True)
    headline: Mapped[str] = mapped_column(String(200), default='Персональные тренировки')
    bio: Mapped[str] = mapped_column(Text, default='')
    sports: Mapped[str] = mapped_column(String(100), default='tennis')
    districts: Mapped[str] = mapped_column(String(160), default='')
    club: Mapped[str] = mapped_column(String(160), default='')
    experience_years: Mapped[int] = mapped_column(Integer, default=0)
    rating_x10: Mapped[int] = mapped_column(Integer, default=50)
    reviews: Mapped[int] = mapped_column(Integer, default=0)
    price: Mapped[int] = mapped_column(Integer, default=2000)
    color: Mapped[str] = mapped_column(String(30), default='#e5efd9')
    emoji: Mapped[str] = mapped_column(String(10), default='🎾')
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship(back_populates='coach_profile')
    slots: Mapped[list['Slot']] = relationship(back_populates='coach')

class CoachSettings(Base):
    __tablename__ = 'coach_settings'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), unique=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    telegram: Mapped[str] = mapped_column(String(100), default='')
    phone: Mapped[str] = mapped_column(String(50), default='')
    photo_data_url: Mapped[str] = mapped_column(Text, default='')
    levels: Mapped[str] = mapped_column(String(200), default='Начинающий,Любитель')
    certificates: Mapped[str] = mapped_column(Text, default='')
    formats: Mapped[str] = mapped_column(String(100), default='individual')
    split_price: Mapped[int] = mapped_column(Integer, default=0)
    group_price: Mapped[int] = mapped_column(Integer, default=0)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    court_booker: Mapped[str] = mapped_column(String(20), default='player')
    cancellation_policy: Mapped[str] = mapped_column(String(220), default='Бесплатная отмена за 24 часа')
    invite_code: Mapped[str] = mapped_column(String(60), default='')
    user: Mapped[User] = relationship(back_populates='coach_settings')

class Slot(Base):
    __tablename__ = 'slots'
    __table_args__ = (UniqueConstraint('coach_id', 'starts_at', name='uq_coach_start'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    coach_id: Mapped[int] = mapped_column(ForeignKey('coaches.id'))
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    coach: Mapped[Coach] = relationship(back_populates='slots')

class Court(Base):
    __tablename__ = 'courts'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    club: Mapped[str] = mapped_column(String(160))
    district: Mapped[str] = mapped_column(String(100))
    sport: Mapped[str] = mapped_column(String(20))
    surface: Mapped[str] = mapped_column(String(60))
    indoor: Mapped[bool] = mapped_column(Boolean, default=True)
    price: Mapped[int] = mapped_column(Integer)
    address: Mapped[str] = mapped_column(String(200))
    windows: Mapped[list['CourtWindow']] = relationship(back_populates='court')

class CoachCourt(Base):
    __tablename__ = 'coach_courts'
    __table_args__ = (UniqueConstraint('coach_id', 'court_id', name='uq_coach_court'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    coach_id: Mapped[int] = mapped_column(ForeignKey('coaches.id'))
    court_id: Mapped[int] = mapped_column(ForeignKey('courts.id'))

class CourtWindow(Base):
    __tablename__ = 'court_windows'
    __table_args__ = (UniqueConstraint('court_id', 'starts_at', name='uq_court_window'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    court_id: Mapped[int] = mapped_column(ForeignKey('courts.id'))
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    court: Mapped[Court] = relationship(back_populates='windows')

class Booking(Base):
    __tablename__ = 'bookings'
    id: Mapped[int] = mapped_column(primary_key=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey('slots.id'))
    player_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    status: Mapped[str] = mapped_column(String(30), default='awaiting_court')
    objective: Mapped[str] = mapped_column(String(200), default='')
    experience: Mapped[str] = mapped_column(String(200), default='')
    need_racket: Mapped[bool] = mapped_column(Boolean, default=False)
    comment: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    slot: Mapped[Slot] = relationship()
    player: Mapped[User] = relationship()
    reservation: Mapped['CourtReservation | None'] = relationship(back_populates='booking', uselist=False)

class CourtReservation(Base):
    __tablename__ = 'court_reservations'
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey('bookings.id'), unique=True)
    court_window_id: Mapped[int] = mapped_column(ForeignKey('court_windows.id'))
    confirmed_by: Mapped[str] = mapped_column(String(20), default='')
    confirmation_code: Mapped[str] = mapped_column(String(140), default='')
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    booking: Mapped[Booking] = relationship(back_populates='reservation')
    court_window: Mapped[CourtWindow] = relationship()
