from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=120)
    role: Literal['player','coach'] = 'player'

class LoginIn(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    role: str
    sport: str
    level: str
    district: str
    priority: str
    experience: str
    onboarding_complete: bool = False
    verified: bool = False

class TokenOut(BaseModel):
    access_token: str
    user: UserOut


class QuestionnaireIn(BaseModel):
    sport: Literal['tennis', 'padel']
    experience: str = Field(min_length=1, max_length=120)
    level: str = Field(min_length=1, max_length=60)
    district: str = Field(min_length=1, max_length=300)
    convenient_time: str = Field(min_length=1, max_length=80)
    priority: str = Field(min_length=1, max_length=80)
    goal: str = Field(min_length=1, max_length=150)

    has_racket: bool = False
    ntrp: str | None = Field(
        default=None,
        pattern=r'^(?:[1-6]\.[05]|7\.0)$'
    )


class CoachOnboardingIn(BaseModel):
    headline: str = Field(min_length=5, max_length=200)
    bio: str = Field(min_length=20, max_length=2500)
    sports: list[Literal['tennis','padel']] = Field(min_length=1)
    levels: list[str] = Field(min_length=1)
    experience_years: int = Field(ge=0, le=70)
    certificates: str = Field(default='', max_length=1500)
    telegram: str = Field(min_length=3, max_length=100)
    phone: str = Field(default='', max_length=50)
    photo_data_url: str = Field(min_length=30, max_length=350000)
    formats: list[Literal['individual','split','group']] = Field(min_length=1)
    price: int = Field(ge=100, le=100000)
    split_price: int = Field(default=0, ge=0)
    group_price: int = Field(default=0, ge=0)
    duration_minutes: int = Field(default=60, ge=30, le=180)
    court_booker: Literal['player','coach'] = 'player'
    court_ids: list[int] = Field(min_length=1, max_length=20)
        
    cancellation_policy: Literal[
        'Бесплатная отмена в любое время',
        'Бесплатная отмена за 6 часов',
        'Бесплатная отмена за 12 часов',
        'Бесплатная отмена за 24 часа',
    ]

    invite_code: str = Field(default='', max_length=60)

    ntrp: str | None = Field(
        default=None,
        pattern=r'^(?:[1-6]\.[05]|7\.0)$'
    )


class SlotIn(BaseModel):
    starts_at: str
    duration_minutes: int = Field(default=60, ge=30, le=180)
    repeat_weeks: int = Field(default=1, ge=1, le=8)

class BookingIn(BaseModel):
    slot_id: int
    court_id: int
    objective: str = Field(default='Отработать технику', max_length=200)
    experience: str = Field(default='', max_length=200)
    need_racket: bool = False
    comment: str = Field(default='', max_length=1000)

class ConfirmCourtIn(BaseModel):
    confirmation_code: str = Field(min_length=1, max_length=140)

class CourtSearchParams(BaseModel):
    sport: str = ''
    district: str = ''
