# Analyze Telemetry Summary

Generated at: 2026-03-15T15:02:51.970Z
Window: last 7 day(s)
Requests sampled: 697
First sample: 2026-03-08T15:14:58Z
Last sample: 2026-03-12T13:02:08Z

## Cache Mix
| Cache | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) |
| --- | ---: | ---: | ---: | ---: |
| hit | 28 | 13.3 | 6.1 | 52.9 |
| miss | 669 | 501.6 | 48.2 | 2972.3 |

## By Pricing Mode
| Pricing Mode | Cache | Requests | P50 Total (ms) | P95 Total (ms) | P95 Lookup (ms) | P95 Compute (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| decklist-set | hit | 15 | 6.2 | 14.5 | n/a | n/a |
| decklist-set | miss | 123 | 244.4 | 3001.0 | 2630.9 | 162.9 |
| oracle-default | hit | 13 | 5.8 | 72.2 | n/a | n/a |
| oracle-default | miss | 546 | 36.4 | 2899.0 | 2751.2 | 116.1 |

## Cold Start Misses
| Cold Start | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) | P95 Lookup (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| yes | 46 | 3049.4 | 3439.1 | 4685.0 | 4213.9 |
| no | 623 | 313.5 | 41.7 | 1431.4 | 1205.9 |

## Slow Miss Shapes
| Pricing Mode | Set Overrides | Deck Size | Commander Source | Requests | Avg Total (ms) | P95 Total (ms) |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| oracle-default | 0 | 100 | none | 24 | 2214.5 | 5289.7 |
| decklist-set | 0 | 100 | none | 19 | 1519.5 | 4673.1 |
| oracle-default | 0 | 2 | section | 26 | 1097.7 | 4583.7 |
| oracle-default | 0 | 1 | section | 60 | 846.0 | 3986.4 |
| oracle-default | 0 | 100 | section | 4 | 1861.4 | 3694.5 |
| oracle-default | 0 | 61 | section | 5 | 931.2 | 3629.2 |
| oracle-default | 0 | 100 | auto | 4 | 1590.6 | 3297.3 |
| decklist-set | 0 | 100 | section | 74 | 746.2 | 2655.7 |
| oracle-default | 0 | 3 | section | 14 | 615.7 | 2227.9 |
| oracle-default | 0 | 5 | section | 14 | 455.2 | 2179.1 |
| oracle-default | 0 | 4 | section | 16 | 390.8 | 1730.3 |
| decklist-set | 0 | 100 | manual | 26 | 362.4 | 1708.9 |
| oracle-default | 0 | 100 | manual | 26 | 390.6 | 1559.8 |
| oracle-default | 0 | 33 | section | 14 | 262.2 | 1441.2 |
| oracle-default | 0 | 46 | section | 3 | 600.5 | 1329.8 |
| oracle-default | 0 | 45 | section | 4 | 338.3 | 1077.3 |
| oracle-default | 0 | 16 | section | 7 | 275.6 | 987.2 |
| oracle-default | 0 | 53 | section | 3 | 634.3 | 954.0 |
| oracle-default | 0 | 6 | section | 16 | 172.6 | 926.4 |
| oracle-default | 0 | 12 | section | 9 | 191.8 | 913.4 |

## Daily Trend
| Day | Requests | P95 Total (ms) | P95 Lookup (ms) |
| --- | ---: | ---: | ---: |
| 2026-03-12 | 26 | 1443.4 | 1237.0 |
| 2026-03-11 | 246 | 1895.6 | 1630.9 |
| 2026-03-10 | 176 | 1245.7 | 975.3 |
| 2026-03-09 | 171 | 2726.2 | 2542.3 |
| 2026-03-08 | 78 | 4678.8 | 3365.8 |

## Commander Options Telemetry
Requests sampled: 9 | First sample: 2026-03-09T17:06:58Z | Last sample: 2026-03-09T18:03:08Z

### Commander Options Cache Mix
| Cache | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) |
| --- | ---: | ---: | ---: | ---: |
| miss | 9 | 460.7 | 109.5 | 1801.7 |

### Commander Options Cold Start Misses
| Cold Start | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) | P95 Lookup (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| yes | 2 | 1739.6 | 1739.6 | 2019.0 | 1857.6 |
| no | 7 | 95.3 | 69.7 | 201.6 | 158.2 |

## Builder Card Search Telemetry
Requests sampled: 1972 | First sample: 2026-03-09T23:47:08Z | Last sample: 2026-03-12T13:09:52Z

### Card Search By Route Kind
| Route Kind | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) | P95 Lookup (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| card-lookup | 1711 | 283.4 | 69.1 | 941.0 | 623.1 |
| card-search | 57 | 121.7 | 36.1 | 466.3 | 447.6 |
| commander-lookup | 65 | 458.0 | 82.9 | 3656.9 | 3469.8 |
| commander-search | 139 | 1640.0 | 52.7 | 5283.2 | 4619.7 |

### Card Search Cold Starts
| Cold Start | Requests | Avg Total (ms) | P50 Total (ms) | P95 Total (ms) |
| --- | ---: | ---: | ---: | ---: |
| yes | 103 | 4516.9 | 4529.6 | 5607.7 |
| no | 1869 | 152.1 | 68.1 | 540.6 |
