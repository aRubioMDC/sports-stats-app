import pytest

from app.core import hockey_model as hm


def test_poisson_pmf_is_a_distribution_with_the_requested_mean():
    pmf = hm.poisson_pmf(3.0)

    assert sum(pmf) == pytest.approx(1.0)
    assert sum(k * p for k, p in enumerate(pmf)) == pytest.approx(3.0, abs=0.01)


def test_margin_distribution_has_no_ties_and_sums_to_one():
    dist = hm.final_margin_distribution(3.2, 2.8)

    assert 0 not in dist
    assert sum(dist.values()) == pytest.approx(1.0)


def test_win_probabilities_favor_the_stronger_side_but_stay_close():
    even_home, even_away = hm.win_probabilities(hm.final_margin_distribution(3.0, 3.0))
    strong_home, strong_away = hm.win_probabilities(hm.final_margin_distribution(3.8, 2.4))

    assert even_home == pytest.approx(0.5, abs=0.01)
    assert even_home + even_away == pytest.approx(1.0, abs=0.01)
    assert 0.6 < strong_home < 0.85
    assert strong_home > even_home


def test_margin_buckets_cover_every_decided_outcome():
    buckets = hm.margin_bucket_probs(hm.final_margin_distribution(3.1, 2.9))

    assert [label for label, _, _ in buckets] == ["1", "2", "3+"]
    assert sum(h + a for _, h, a in buckets) == pytest.approx(1.0, abs=0.01)


def test_over_under_complements_and_decreases_with_the_line():
    rows = hm.over_under(6.2, hm.total_lines(6.2))

    assert len(rows) == 5
    for _, over, under in rows:
        assert over + under == pytest.approx(1.0, abs=0.01)
    overs = [over for _, over, _ in rows]
    assert overs == sorted(overs, reverse=True)


def test_puck_line_cover_is_harder_for_the_favorite_as_the_line_grows():
    dist = hm.final_margin_distribution(3.6, 2.5)
    covers = {line: home for line, home, _ in hm.spread_cover(dist, [-2.5, -1.5, -0.5])}

    assert covers[-0.5] > covers[-1.5] > covers[-2.5]
    assert covers[-0.5] == pytest.approx(hm.win_probabilities(dist)[0], abs=0.01)
