import json
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

# Пустой день: с 10:00, 3-часовая услуга должна закончиться к 22:00 — последний старт 19:00.
slots = free_starts(DAY, 180, [], NOW)
assert slots[0] == at(10) and slots[-1] == at(19), slots
assert free_starts(DAY, 60, [], NOW)[-1] == at(21)

# Занято 15:00–16:00, дорога 60 мин: 3-часовая услуга должна закончиться к 14:00
# и может начаться не раньше 17:00.
slots = free_starts(DAY, 180, [(at(15), at(16))], NOW)
assert at(11) in slots and at(11, 30) not in slots
assert at(16, 30) not in slots and at(17) in slots

# Выходной (весь день) — ни одного слота.
assert free_starts(DAY, 60, [(at(0), at(0, d=DAY + timedelta(days=1)))], NOW) == []

# Минимум 6 часов до записи: сейчас 09:00 — первый слот сегодня в 15:00, а не в 10:00.
assert free_starts(NOW.date(), 60, [], NOW)[0] == at(15, d=NOW.date())

# Месяц: прошлые дни не отдаются, октябрь начинается с сегодняшнего дня.
status, data = get_slots({"service": "day", "month": "2026-10"}, FakeCal([]), NOW)
assert status == 200 and min(data["days"]) == "2026-10-01" and "2026-10-31" in data["days"]
assert get_slots({"service": "nope"}, FakeCal([]), NOW)[0] == 400

# Заявка: валидная создаёт событие, повторная на то же время — нет.
form = {"service": "wedding", "date": "2026-10-05", "time": "10:00", "name": "Мария",
        "phone": "+7 999 123-45-67", "address": "Химки", "comment": "", "consent": True}
cal = FakeCal([])
assert create_booking(form, cal, NOW) == (200, {"ok": True, "telegram": "not configured"}) and len(cal.saved) == 1
assert "STATUS:TENTATIVE" in cal.saved[0] and "DTSTART;TZID=Europe/Moscow:20261005T100000" in cal.saved[0]
assert "Согласие на обработку ПДн отмечено" in cal.saved[0]

# В Telegram не уходят персональные данные — только услуга и время.
sent = []
booking._notify = lambda text: sent.append(text)
create_booking({**form, "date": "2026-10-06"}, FakeCal([]), NOW)
assert sent and not any(x in sent[0] for x in ("Мария", "123-45-67", "Химки")), sent
assert "?view=" in sent[0] and "@nastya-site" in sent[0], sent

# Страничка заявки: собирается из сохранённого события, телефон — ссылка для звонка.
import icalendar
class UidCal(FakeCal):
    def event_by_uid(self, uid):
        ev = next(c for c in icalendar.Calendar.from_ical(self.saved[-1]).walk("VEVENT") if str(c["UID"]) == uid)
        return type("Obj", (), {"icalendar_component": ev})()
uc = UidCal([])
create_booking({**form, "date": "2026-10-07"}, uc, NOW)
uid = sent[-1].split("?view=")[1]
status, page = booking.view_booking(uid, uc)
assert status == 200 and "Мария" in page and 'href="tel:+79991234567"' in page, page
assert booking.view_booking("../etc", uc)[0] == 404

# GET по ссылке отдаёт только кнопку — без данных (их увидел бы робот превью).
booking._calendar = lambda: uc
shell = booking.handler({"httpMethod": "GET", "queryStringParameters": {"view": uid}}, None)
assert shell["statusCode"] == 200 and "Мария" not in shell["body"] and "Показать заявку" in shell["body"]
shown = booking.handler({"httpMethod": "POST", "body": json.dumps({"view": uid})}, None)
assert "Мария" in shown["body"], shown
assert create_booking(form, FakeCal([(at(10), at(13))]), NOW)[0] == 409
assert create_booking({**form, "phone": "abc"}, cal, NOW)[0] == 400
assert create_booking({**form, "consent": False}, cal, NOW)[0] == 400
assert create_booking({**form, "time": "10:15"}, FakeCal([]), NOW)[0] == 409   # не по сетке
bot = FakeCal([])
assert create_booking({**form, "website": "spam"}, bot, NOW)[0] == 200 and not bot.saved

print("ok")
