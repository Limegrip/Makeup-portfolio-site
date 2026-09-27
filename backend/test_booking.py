"""Проверка логики записи без Яндекса: python3 backend/test_booking.py"""
from datetime import date, datetime, timedelta

import booking
from booking import TZ, create_booking, free_starts, get_slots

NOW = datetime(2026, 10, 1, 9, 0, tzinfo=TZ)
DAY = date(2026, 10, 5)


def at(h, m=0, d=DAY):
    return datetime(d.year, d.month, d.day, h, m, tzinfo=TZ)


class FakeCal:
    def __init__(self, busy):
        self.busy, self.saved = busy, []

    def save_event(self, ical):
        self.saved.append(ical)


booking.busy_between = lambda cal, s, e: cal.busy  # календарь подменён

# Пустой день: с 06:00, последний старт — так, чтобы закончить к 21:00.
slots = free_starts(DAY, 180, [], NOW)
assert slots[0] == at(6) and slots[-1] == at(18), slots

# Занято 12:00–14:00, дорога 60 мин: 3-часовая услуга должна закончиться к 11:00
# и может начаться не раньше 15:00.
slots = free_starts(DAY, 180, [(at(12), at(14))], NOW)
assert at(8) in slots and at(8, 30) not in slots
assert at(14, 30) not in slots and at(15) in slots

# Выходной (весь день) — ни одного слота.
assert free_starts(DAY, 60, [(at(0), at(0, d=DAY + timedelta(days=1)))], NOW) == []

# Минимум 12 часов до записи: сегодня в 09:00 — первый слот не раньше 21:00, т.е. нет.
assert free_starts(NOW.date(), 60, [], NOW) == []

# Месяц: прошлые дни не отдаются, октябрь начинается с сегодняшнего дня.
status, data = get_slots({"service": "day", "month": "2026-10"}, FakeCal([]), NOW)
assert status == 200 and min(data["days"]) == "2026-10-01" and "2026-10-31" in data["days"]
assert get_slots({"service": "nope"}, FakeCal([]), NOW)[0] == 400

# Заявка: валидная создаёт событие, повторная на то же время — нет.
form = {"service": "wedding", "date": "2026-10-05", "time": "10:00", "name": "Мария",
        "phone": "+7 999 123-45-67", "address": "Химки", "comment": "", "consent": True}
cal = FakeCal([])
assert create_booking(form, cal, NOW) == (200, {"ok": True}) and len(cal.saved) == 1
assert "STATUS:TENTATIVE" in cal.saved[0] and "DTSTART;TZID=Europe/Moscow:20261005T100000" in cal.saved[0]
assert create_booking(form, FakeCal([(at(10), at(13))]), NOW)[0] == 409
assert create_booking({**form, "phone": "abc"}, cal, NOW)[0] == 400
assert create_booking({**form, "consent": False}, cal, NOW)[0] == 400
assert create_booking({**form, "time": "10:15"}, FakeCal([]), NOW)[0] == 409   # не по сетке
bot = FakeCal([])
assert create_booking({**form, "website": "spam"}, bot, NOW)[0] == 200 and not bot.saved

print("ok")
