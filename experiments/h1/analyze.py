# -*- coding: utf-8 -*-
"""
FitSpot — H1. Анализ результатов стенда конкурентного бронирования.

Основная метрика гипотезы: доля попыток, завершившихся состоянием,
которое нельзя разрешить автоматически (unsafe_abort), и её пересчёт
в число случаев ручного разбора в неделю при прогнозном потоке обращений.

Критерий принятия: в тестовом контуре (preclaim) не более 1 случая в неделю
при уровне конкуренции, соответствующем пилоту; в контрольном — больше.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

RNG = np.random.default_rng(42)
RESULTS = Path(__file__).parent / "results.json"
SUMMARY_OUT = Path(__file__).parent / "summary.csv"

# поток обращений в неделю (см. теоретический анализ, п. 3.3)
FLOW = {"пилот (2 клуба)": 28, "2027 (~53 клуба)": 748}
# уровень конкуренции, соответствующий пилоту:
# ожидаемое число конкурентов на слот ~1,0
PILOT_C = 1
THRESHOLD_PER_WEEK = 1.0


def boot_ci_prop(successes, n, reps=5000, alpha=0.05):
    """Перцентильный бутстреп-ДИ для доли."""
    if n == 0:
        return (float("nan"), float("nan"))
    x = np.zeros(n); x[:successes] = 1
    idx = RNG.integers(0, n, size=(reps, n))
    d = x[idx].mean(axis=1)
    return float(np.percentile(d, 100*alpha/2)), float(np.percentile(d, 100*(1-alpha/2)))


def main():
    df = pd.DataFrame(json.load(open(RESULTS)))
    pd.set_option("display.width", 220, "display.max_columns", 40)
    print(f"Всего измерений: {len(df)}")
    print(f"Ячеек сетки:     {df.groupby(['config','C','D']).ngroups}\n")

    # ------------------------------------------------------------------
    print("=" * 78)
    print("1. РАСПРЕДЕЛЕНИЕ ИСХОДОВ ПО КОНТУРАМ, %")
    print("=" * 78)
    oc = (df.groupby("config").outcome.value_counts(normalize=True)
            .mul(100).round(2).unstack(fill_value=0))
    print(oc.to_string(), "\n")

    if "payment_failed" in df.outcome.unique():
        n_comp = int((df.outcome == "payment_failed").sum())
        print(f"Ветка компенсации выполнялась: {n_comp} раз "
              f"({100*n_comp/len(df):.1f}% попыток)\n")
    else:
        print("ВНИМАНИЕ: ветка компенсации ни разу не выполнялась "
              "(FAIL_PROB = 0?)\n")

    # ------------------------------------------------------------------
    print("=" * 78)
    print("2. ОСНОВНАЯ МЕТРИКА: доля неопределённых состояний (UnsafeRate)")
    print("=" * 78)
    rows = []
    for (cfg, c, d), g in df.groupby(["config", "C", "D"]):
        n = len(g)
        k = int((g.outcome == "unsafe_abort").sum())
        lo, hi = boot_ci_prop(k, n)
        rows.append({"config": cfg, "C": c, "D": d, "n": n, "unsafe": k,
                     "rate": k/n, "ci_lo": lo, "ci_hi": hi,
                     "в_неделю_пилот": k/n * FLOW["пилот (2 клуба)"],
                     "в_неделю_2027": k/n * FLOW["2027 (~53 клуба)"]})
    S = pd.DataFrame(rows).sort_values(["config", "C", "D"])
    S.to_csv(SUMMARY_OUT, index=False)
    print(S.to_string(index=False, float_format=lambda v: f"{v:8.4f}"), "\n")

    # ------------------------------------------------------------------
    print("=" * 78)
    print(f"3. ПРОВЕРКА КРИТЕРИЯ при уровне конкуренции пилота (C = {PILOT_C})")
    print("=" * 78)
    pil = S[S.C == PILOT_C]
    if pil.empty:
        print(f"Нет данных для C = {PILOT_C}\n")
    else:
        print(f"Порог: не более {THRESHOLD_PER_WEEK:.0f} случая ручного разбора в неделю\n")
        for cfg in ("control", "preclaim"):
            sub = pil[pil.config == cfg]
            if sub.empty:
                continue
            worst = sub.loc[sub.rate.idxmax()]
            tot_n = int(sub.n.sum()); tot_k = int(sub.unsafe.sum())
            lo, hi = boot_ci_prop(tot_k, tot_n)
            print(f"  {cfg}:")
            print(f"    всего попыток {tot_n}, неопределённых {tot_k}, "
                  f"доля {tot_k/tot_n:.4f}  95% ДИ [{lo:.4f}; {hi:.4f}]")
            print(f"    в неделю на пилоте:  {tot_k/tot_n*28:.2f}   "
                  f"ДИ [{lo*28:.2f}; {hi*28:.2f}]")
            print(f"    в неделю в 2027:     {tot_k/tot_n*748:.2f}   "
                  f"ДИ [{lo*748:.2f}; {hi*748:.2f}]")
            print(f"    худшая ячейка: D={int(worst.D)} мс, доля {worst.rate:.4f}")
            verdict = "УКЛАДЫВАЕТСЯ" if hi*28 <= THRESHOLD_PER_WEEK else "НЕ УКЛАДЫВАЕТСЯ"
            print(f"    по верхней границе ДИ на пилоте: {verdict}\n")

    # ------------------------------------------------------------------
    print("=" * 78)
    print("4. СРАВНЕНИЕ КОНТУРОВ")
    print("=" * 78)
    print("Дизайн неспаренный: контуры прогоняются отдельно, одна и та же попытка")
    print("не наблюдается в обоих. Поэтому применяется точный критерий Фишера для")
    print("таблицы 2x2, а не критерий Мак-Немара (он требует спаренных наблюдений).\n")
    for c in sorted(df.C.unique()):
        a = df[(df.config == "control") & (df.C == c)]
        b = df[(df.config == "preclaim") & (df.C == c)]
        if a.empty or b.empty:
            continue
        ka = int((a.outcome == "unsafe_abort").sum()); na = len(a)
        kb = int((b.outcome == "unsafe_abort").sum()); nb = len(b)
        table = [[ka, na-ka], [kb, nb-kb]]
        try:
            _, pval = stats.fisher_exact(table)
        except Exception:
            pval = float("nan")
        # бутстреп-ДИ для разности долей
        xa = np.zeros(na); xa[:ka] = 1
        xb = np.zeros(nb); xb[:kb] = 1
        da = xa[RNG.integers(0, na, size=(5000, na))].mean(axis=1)
        db = xb[RNG.integers(0, nb, size=(5000, nb))].mean(axis=1)
        dd = da - db
        print(f"  C={c:3d}:  control {ka:4d}/{na:4d} = {ka/na:.4f}   "
              f"preclaim {kb:4d}/{nb:4d} = {kb/nb:.4f}   "
              f"разность {ka/na-kb/nb:+.4f} "
              f"95% ДИ [{np.percentile(dd,2.5):+.4f}; {np.percentile(dd,97.5):+.4f}]   "
              f"p = {pval:.2e}")
    print()

    # ------------------------------------------------------------------
    print("=" * 78)
    print("5. ЗАДЕРЖКА УСПЕШНОЙ БРОНИ, медиана и p95, мс")
    print("=" * 78)
    lat = df[df.outcome == "won"].groupby(["config", "C", "D"]).latency_ms.agg(
        n="count", median="median",
        p95=lambda s: float(np.percentile(s, 95)))
    print(lat.round(1).to_string(), "\n")

    print("=" * 78)
    print("6. ПОВТОРЫ В ТЕСТОВОМ КОНТУРЕ")
    print("=" * 78)
    rt = df[df.config == "preclaim"].groupby(["C", "D"]).retries.agg(
        всего="sum", среднее="mean").round(3)
    print(rt.to_string())


if __name__ == "__main__":
    main()
