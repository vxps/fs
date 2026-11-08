"""
FitSpot — H1. Эксперимент: влияние длительности внешнего платёжного вызова
на конкурентное бронирование слота тренера.

Control (in-tx)    : внешний платёжный вызов ВНУТРИ транзакции, из-за чего
                     блокировка по ограничению EXCLUDE удерживается всё время вызова.
Test    (pre-claim): короткая транзакция закрепляет слот (status='pending'),
                     платёжный вызов выполняется СНАРУЖИ транзакции,
                     вторая короткая транзакция подтверждает (status='confirmed').

Обе конфигурации используют одно и то же ограничение целостности
EXCLUDE USING gist (trainer_id WITH =, during WITH &&).
Двойное бронирование невозможно ни в одной из них по построению —
предметом сравнения является НЕ корректность, а время, за которое
проигравший пользователь узнаёт о конфликте, и латентность победителя.
"""
import json
import os
import random
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
from psycopg2 import errors as pgerr

# ── Настройки подключения ─────────────────────────────────────────
DSN = os.getenv(
    "DATABASE_DSN",
    "host=127.0.0.1 port=5432 user=postgres dbname=fitspot_experiment",
)

# ── Параметры эксперимента ────────────────────────────────────────
C_LEVELS = [1, 2, 5, 10, 25]            # одновременно конкурирующих игроков
                                         # 1 — уровень, соответствующий пилоту
                                         # (ожидаемое число конкурентов на слот ~1,0);
                                         # остальные — запас прочности на рост
D_LEVELS = [0, 100, 500, 1000, 2000]     # длительность внешнего вызова, мс
ROUNDS = 20                              # независимых раундов на ячейку сетки
FAIL_PROB = 0.05                         # доля отказов платёжного провайдера:
                                         # без неё ветка компенсации не выполняется
MAX_RETRY = 6

TRANSIENT = (pgerr.DeadlockDetected, pgerr.SerializationFailure)

OUT = Path(__file__).parent / "results.json"

_slot_counter = 0
_slot_lock = threading.Lock()


def next_slot():
    """Каждый раунд получает собственный слот: раунды не влияют друг на друга."""
    global _slot_counter
    with _slot_lock:
        _slot_counter += 1
        n = _slot_counter
    start = datetime(2027, 1, 1, tzinfo=timezone.utc) + timedelta(hours=n)
    return n, start, start + timedelta(hours=1)


def backoff(attempt):
    time.sleep(0.002 * (2 ** attempt) * (0.5 + random.random()))


def payment_call(d_ms, fail_prob=0.0):
    """Эмуляция обращения к платёжному провайдеру (холд средств)."""
    if d_ms:
        time.sleep(d_ms / 1000.0)
    if fail_prob and random.random() < fail_prob:
        raise RuntimeError("payment declined")


def attempt_control(cur, conn, slot, player_id, d_ms, fail_prob):
    """Платёжный вызов ВНУТРИ транзакции: блокировка удерживается d_ms.

    Повтор при взаимной блокировке здесь НЕДОПУСТИМ: платёжный вызов уже
    выполнен, транзакция откачена, и фактический результат списания неизвестен.
    Повторная попытка означала бы второе обращение к провайдеру. Поэтому
    взаимная блокировка в этой конфигурации даёт исход unsafe_abort —
    заявку приходится разрешать сверкой состояния вручную.
    """
    trainer_id, start, end = slot
    try:
        cur.execute("BEGIN")
        cur.execute(
            "INSERT INTO bookings (trainer_id, during, player_id, status) "
            "VALUES (%s, tstzrange(%s,%s,'[)'), %s, 'confirmed')",
            (trainer_id, start, end, player_id))
        payment_call(d_ms, fail_prob)          # внешний вызов в открытой транзакции
        cur.execute("COMMIT")
        return "won", 0
    except pgerr.ExclusionViolation:
        cur.execute("ROLLBACK")
        return "lost", 0
    except TRANSIENT:
        cur.execute("ROLLBACK")
        return "unsafe_abort", 0
    except RuntimeError:
        cur.execute("ROLLBACK")
        return "payment_failed", 0


def attempt_preclaim(cur, conn, slot, player_id, d_ms, fail_prob):
    """Короткая claim-транзакция, платёжный вызов снаружи, короткий confirm."""
    trainer_id, start, end = slot
    retries = 0
    booking_id = None

    # фаза 1: закрепление слота. Транзакция максимально короткая.
    for a in range(MAX_RETRY):
        try:
            cur.execute("BEGIN")
            cur.execute(
                "INSERT INTO bookings (trainer_id, during, player_id, status) "
                "VALUES (%s, tstzrange(%s,%s,'[)'), %s, 'pending') RETURNING id",
                (trainer_id, start, end, player_id))
            booking_id = cur.fetchone()[0]
            cur.execute("COMMIT")
            break
        except pgerr.ExclusionViolation:
            cur.execute("ROLLBACK")
            return "lost", retries
        except TRANSIENT:
            cur.execute("ROLLBACK")
            retries += 1
            backoff(a)
    if booking_id is None:
        return "exhausted", retries

    # фаза 2: платёжный вызов вне транзакции, блокировки не удерживаются
    try:
        payment_call(d_ms, fail_prob)
    except RuntimeError:
        for a in range(MAX_RETRY):          # компенсация: снятие закрепления
            try:
                cur.execute("BEGIN")
                cur.execute("DELETE FROM bookings WHERE id=%s", (booking_id,))
                cur.execute("COMMIT")
                break
            except TRANSIENT:
                cur.execute("ROLLBACK")
                retries += 1
                backoff(a)
        return "payment_failed", retries

    # фаза 3: подтверждение, снова короткая транзакция
    for a in range(MAX_RETRY):
        try:
            cur.execute("BEGIN")
            cur.execute("UPDATE bookings SET status='confirmed' WHERE id=%s",
                        (booking_id,))
            cur.execute("COMMIT")
            return "won", retries
        except TRANSIENT:
            cur.execute("ROLLBACK")
            retries += 1
            backoff(a)
    return "confirm_failed", retries


ATTEMPT = {"control": attempt_control, "preclaim": attempt_preclaim}


def run_round(config, c, d_ms, fail_prob, results):
    """Один раунд: c игроков одновременно претендуют на один и тот же слот."""
    slot = next_slot()
    barrier = threading.Barrier(c)
    local, lk = [], threading.Lock()

    def worker(player_id):
        conn = psycopg2.connect(DSN)
        conn.autocommit = True
        cur = conn.cursor()
        try:
            barrier.wait()                  # синхронный старт всех участников
            t0 = time.perf_counter()
            try:
                outcome, retries = ATTEMPT[config](cur, conn, slot, player_id,
                                                   d_ms, fail_prob)
            except Exception as ex:
                outcome, retries = f"error:{type(ex).__name__}", 0
            ms = (time.perf_counter() - t0) * 1000.0
            with lk:
                local.append({"outcome": outcome, "latency_ms": ms,
                              "retries": retries})
        finally:
            conn.close()

    ts = [threading.Thread(target=worker, args=(i,)) for i in range(c)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    for r in local:
        r.update({"config": config, "C": c, "D": d_ms})
        results.append(r)


def reset_db():
    global _slot_counter
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    conn.cursor().execute("TRUNCATE bookings")
    conn.close()
    _slot_counter = 0


def check_invariant():
    """Проверка бизнес-инварианта: ни одной пары пересекающихся бронирований."""
    conn = psycopg2.connect(DSN)
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM bookings a JOIN bookings b "
                "ON a.id<b.id AND a.trainer_id=b.trainer_id AND a.during && b.during")
    overlaps = cur.fetchone()[0]
    cur.execute("SELECT status, count(*) FROM bookings GROUP BY status")
    st = dict(cur.fetchall())
    conn.close()
    return overlaps, st


def main():
    results = []
    overlaps_total = 0
    t0 = time.time()
    total_cells = 2 * len(C_LEVELS) * len(D_LEVELS)
    cell = 0
    for config in ("control", "preclaim"):
        for c in C_LEVELS:
            for d in D_LEVELS:
                cell += 1
                reset_db()
                for _ in range(ROUNDS):
                    run_round(config, c, d, FAIL_PROB, results)
                ov, _ = check_invariant()      # инвариант проверяется в каждой ячейке
                overlaps_total += ov
                # промежуточное сохранение: прогон можно прервать без потери данных
                with open(OUT, "w") as f:
                    json.dump(results, f)
                print(f"[{time.time()-t0:7.1f}s] ячейка {cell:2d}/{total_cells}  "
                      f"{config:9s} C={c:3d} D={d:5d}ms  "
                      f"{ROUNDS} раундов, пересечений={ov}", flush=True)
    with open(OUT, "w") as f:
        json.dump(results, f)
    print(f"\nизмерений: {len(results)}  пересечений всего: {overlaps_total}")


if __name__ == "__main__":
    main()
