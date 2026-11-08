-- FitSpot — H1: стенд проверки гипотезы конкурентного бронирования
-- Схема данных броней с ограничением непересечения

DROP TABLE IF EXISTS bookings;

-- GiST сам по себе не умеет сравнивать целые на равенство.
-- btree_gist добавляет операторную семью, без неё ограничение не создастся.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE bookings (
    id         bigserial PRIMARY KEY,
    trainer_id int  NOT NULL,
    during     tstzrange NOT NULL,
    player_id  int  NOT NULL,
    status     text NOT NULL DEFAULT 'confirmed',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT no_overlap EXCLUDE USING gist (trainer_id WITH =, during WITH &&)
);

-- Запас свободного места в странице нужен, чтобы UPDATE статуса выполнялся
-- как HOT-обновление и не трогал GiST-индекс. Иначе на фазе подтверждения
-- возникает взаимная блокировка по ограничению непересечения.
ALTER TABLE bookings SET (fillfactor = 70);

-- По той же причине НЕ создаём индекс по (status, created_at):
-- любой дополнительный индекс по изменяемому столбцу отключает HOT.
