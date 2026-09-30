"""Shared math for turning American odds into a fair (de-vigged) probability and
comparing it against our own model's hit-rate estimate to get a real edge."""


def american_to_implied_prob(price: float) -> float:
    """Raw implied probability from an American odds price — includes the vig."""
    if price > 0:
        return 100 / (price + 100)
    return -price / (-price + 100)


def devig_two_way(over_price: float, under_price: float) -> tuple[float, float]:
    """
    Removes the vig from a two-way (over/under) market by normalizing the two
    raw implied probabilities so they sum to 1 — the standard "fair odds"
    approach, since a real sportsbook's over+under always sum to > 100%.
    """
    over_raw = american_to_implied_prob(over_price)
    under_raw = american_to_implied_prob(under_price)
    total = over_raw + under_raw
    if total <= 0:
        return (0.5, 0.5)
    return (over_raw / total, under_raw / total)


def compute_edge(model_prob: float, fair_market_prob: float) -> float:
    """Our model's hit-rate estimate minus the market's fair (de-vigged) probability
    for the same side — positive means our model thinks this hits more often than
    the market is pricing in."""
    return model_prob - fair_market_prob
