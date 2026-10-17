import os
import base64
import tempfile
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
_testdir=tempfile.TemporaryDirectory()
os.environ['DATABASE_URL']=f'sqlite:///{_testdir.name}/test.db'
os.environ['SEED_DEMO']='true'
from fastapi.testclient import TestClient
from app.main import app

def register(client,name,email,role='player'):
    res=client.post('/api/auth/register',json={'name':name,'email':email,'password':'abcd1234','role':role})
    assert res.status_code==201,res.text
    return {'Authorization':'Bearer '+res.json()['access_token']}

def login(client,email,password='Coach123!'):
    res=client.post('/api/auth/login',json={'email':email,'password':password})
    assert res.status_code==200,res.text
    return {'Authorization':'Bearer '+res.json()['access_token']}

QUESTIONNAIRE={'sport':'tennis','experience':'1–3 года','level':'Любитель','district':'Хамовники','convenient_time':'Вечер (после 17:00)','priority':'Близость','goal':'Улучшить технику'}

def test_seed_and_ranked_feed():
    with TestClient(app) as client:
        assert client.get('/api/health').json()['status']=='ok'
        courts=client.get('/api/courts').json()
        assert len(courts)==100
        assert sum(c['sport']=='padel' for c in courts)==40
        offers=client.get('/api/feed',params={'sport':'tennis','sort':'price','limit':100}).json()
        assert offers
        assert all(o['total_price']==o['coach']['price']+o['court']['price'] for o in offers)
        assert all(o['court']['sport']=='tennis' for o in offers)
        assert [o['total_price'] for o in offers]==sorted(o['total_price'] for o in offers)
        assert len(client.get('/api/coaches').json())==6
        assert client.get('/api/feed',params={'period':'evening','limit':50}).status_code==200
        assert client.get('/api/feed',params={'date':'abc'}).status_code==422
        assert client.get('/api/feed',params={'sort':'invalid'}).status_code==422

def test_player_onboarding_booking_and_court_confirmation():
    with TestClient(app) as client:
        headers=register(client,'Игрок Тест','player.test@example.com')
        assert client.get('/api/auth/me',headers=headers).json()['onboarding_complete'] is False
        offer=next(o for o in client.get('/api/feed',params={'sport':'tennis','limit':100}).json() if o['coach']['court_booker']=='player')
        body={'slot_id':offer['slot']['id'],'court_id':offer['court']['id'],'objective':'Улучшить технику'}
        assert client.post('/api/bookings',headers=headers,json=body).status_code==409
        res=client.post('/api/player/questionnaire',headers=headers,json=QUESTIONNAIRE)
        assert res.status_code==200 and res.json()['onboarding_complete'] is True
        res=client.post('/api/bookings',headers=headers,json=body)
        assert res.status_code==201,res.text
        id=res.json()['id']
        assert client.post('/api/bookings',headers=headers,json=body).status_code==409
        assert client.post(f'/api/bookings/{id}/complete',headers=headers).status_code==403
        assert client.post(f'/api/bookings/{id}/court-confirm',headers=headers,json={'confirmation_code':'DEMO42'}).status_code==200
        record=client.get('/api/bookings/my',headers=headers).json()[0]
        assert record['status']=='confirmed' and record['court_confirmation_code']=='DEMO42'
        assert client.post(f'/api/bookings/{id}/court-confirm',headers=headers,json={'confirmation_code':'again'}).status_code==409
        coach_id=offer['coach']['id']
        coach_headers=login(client,f'coach{coach_id}@fitspot.local')
        assert client.post(f'/api/bookings/{id}/complete',headers=coach_headers).json()['status']=='completed'
        assert client.post(f'/api/bookings/{id}/cancel',headers=headers).status_code==409

def test_coach_booker_permissions_cancel_and_rebook():
    with TestClient(app) as client:
        first=register(client,'Игрок А','one@example.com')
        second=register(client,'Игрок Б','two@example.com')
        for headers in (first,second):assert client.post('/api/player/questionnaire',headers=headers,json=QUESTIONNAIRE).status_code==200
        offer=next(o for o in client.get('/api/feed',params={'limit':100}).json() if o['coach']['court_booker']=='coach')
        data={'slot_id':offer['slot']['id'],'court_id':offer['court']['id']}
        result=client.post('/api/bookings',headers=first,json=data)
        assert result.status_code==201,result.text
        id=result.json()['id']
        assert client.post(f'/api/bookings/{id}/court-confirm',headers=first,json={'confirmation_code':'123'}).status_code==403
        assert client.post(f'/api/bookings/{id}/cancel',headers=second).status_code==403
        coach=login(client,f"coach{offer['coach']['id']}@fitspot.local")
        assert client.post(f'/api/bookings/{id}/court-confirm',headers=coach,json={'confirmation_code':'COURT-1'}).status_code==200
        assert client.post(f'/api/bookings/{id}/cancel',headers=first).json()['status']=='cancelled'
        assert client.post('/api/bookings',headers=second,json=data).status_code==201

def test_new_coach_flow_and_admin_verification():
    with TestClient(app) as client:
        coach=register(client,'Новый Тренер','new.coach@example.com','coach')
        assert client.get('/api/auth/me',headers=coach).json()['onboarding_complete'] is False
        photo='data:image/jpeg;base64,'+base64.b64encode(b'\xff\xd8\xff\x00\xff\xd9').decode()
        court=next(c for c in client.get('/api/courts').json() if c['sport']=='tennis')
        data={'headline':'Персональные тренировки по теннису','bio':'Обучаю теннису от первых ударов до уверенной игры и побед.',
              'sports':['tennis'],'levels':['Начинающий'],'experience_years':5,'certificates':'КМС',
              'telegram':'@coach','photo_data_url':photo,'formats':['individual'],
              'price':2900,'court_booker':'coach','court_ids':[court['id']],
              'cancellation_policy':'Бесплатная отмена за 24 часа'}
        res=client.post('/api/coach/onboarding',headers=coach,json=data)
        assert res.status_code==200,res.text
        assert res.json()['onboarding_complete'] and not res.json()['verified']
        new_id=client.get('/api/coach/me',headers=coach).json()['profile']['id']
        assert all(c['id']!=new_id for c in client.get('/api/coaches').json())
        slot_day=(datetime.now(ZoneInfo('Europe/Moscow'))+timedelta(days=2)).date().isoformat()
        created=client.post('/api/coach/slots',headers=coach,json={'starts_at':f'{slot_day}T18:00','repeat_weeks':3})
        assert created.status_code==201,created.text
        assert len(created.json()['created'])==3
        own=client.get('/api/coach/me',headers=coach).json()
        assert len(own['slots'])==3
        assert len(client.get(f"/api/courts/{court['id']}/windows").json())>0
        admin=login(client,'admin@fitspot.local','Admin123!')
        assert client.get('/api/admin/pending',headers=coach).status_code==403
        assert any(c['id']==new_id for c in client.get('/api/admin/pending',headers=admin).json())
        assert client.post(f'/api/admin/coaches/{new_id}/verify',headers=admin).status_code==200
        assert any(c['id']==new_id for c in client.get('/api/coaches').json())
        assert client.get('/api/auth/me',headers=coach).json()['verified']

def test_production_seed_has_no_public_demo_credentials(monkeypatch, tmp_path):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.db import Base
    from app.seed import seed
    from app.models import User
    from app.auth import verify_password
    engine = create_engine(f'sqlite:///{tmp_path / "production_demo.db"}')
    Base.metadata.create_all(engine)
    monkeypatch.setenv('ENVIRONMENT', 'production')
    monkeypatch.setenv('ADMIN_EMAIL', 'private.admin@example.com')
    monkeypatch.setenv('ADMIN_PASSWORD', 'safe-demo-pass-12345')
    with Session(engine) as db:
        seed(db)
        assert db.scalar(select(User).where(User.email == 'admin@fitspot.local')) is None
        admin = db.scalar(select(User).where(User.email == 'private.admin@example.com'))
        assert admin is not None and verify_password('safe-demo-pass-12345', admin.password_hash)
        demo_coach = db.scalar(select(User).where(User.email == 'coach1@fitspot.local'))
        assert demo_coach is not None and not verify_password('Coach123!', demo_coach.password_hash)
    engine.dispose()
