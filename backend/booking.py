"""Онлайн-запись: функция Yandex Cloud между сайтом и Яндекс Календарём.

GET  ?service=<id>&month=YYYY-MM  -> услуги и свободное время на месяц
POST {service, date, time, name, phone, address, comment, consent, website}
     -> событие «Заявка» в календаре + сообщение в Telegram

Настройки — переменные окружения функции (см. backend/README.md), поэтому
чтобы переключиться на календарь Насти, код менять не нужно.
"""
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Moscow")

# Длительность — только работа. Дорогу добавляет BUFFER_MIN с обеих сторон.
SERVICES = {
    "wedding": ("Свадебный образ", 180),
    "trial": ("Пробный образ", 180),
    "evening": ("Вечерний макияж", 120),
    "day": ("Дневной макияж", 60),
    "hair": ("Причёски и укладки", 60),
    "lesson": ("Обучение визажу", 180),
}
BUFFER_MIN = int(os.environ.get("BUFFER_MIN", 60))   # дорога до и после
OPEN, CLOSE = time(10, 0), time(22, 0)               # запись с сайта: 10:00–22:00
STEP_MIN = 30
NOTICE_HOURS = 6                                     # не раньше, чем через 6 ч
HORIZON_DAYS = 365                                   # свадьбы бронируют заранее


def free_starts(day, minutes, busy, now):
    """Свободные времена начала услуги в день day. Услуга целиком укладывается
    в OPEN–CLOSE; ранние и поздние записи Настя ставит в календарь сама.

    busy — список (start, end) aware-datetime. Слот свободен, если вместе с
    дорогой до и после он не пересекается ни с одним занятым интервалом.
    """
    buf = timedelta(minutes=BUFFER_MIN)
    dur = timedelta(minutes=minutes)
    t = datetime.combine(day, OPEN, TZ)
    close = datetime.combine(day, CLOSE, TZ)
    earliest = now + timedelta(hours=NOTICE_HOURS)
    out = []
    while t + dur <= close:
        if t >= earliest and not any(s < t + dur + buf and e > t - buf for s, e in busy):
            out.append(t)
        t += timedelta(minutes=STEP_MIN)
    return out


def _as_dt(value):
    # Событие «на весь день» (выходной, отпуск) приходит датой, а не временем.
    if isinstance(value, datetime):
        return value.astimezone(TZ) if value.tzinfo else value.replace(tzinfo=TZ)
    return datetime.combine(value, time(0), TZ)


def _calendar():
    import caldav  # тяжёлый импорт — только когда реально идём в календарь

    client = caldav.DAVClient(
        url="https://caldav.yandex.ru",
        username=os.environ["YANDEX_LOGIN"],
        password=os.environ["YANDEX_APP_PASSWORD"],
    )
    calendars = client.principal().calendars()
    wanted = os.environ.get("CALENDAR_NAME")
    for cal in calendars:
        if not wanted or cal.name == wanted:
            return cal
    raise RuntimeError(f"Календарь {wanted!r} не найден")


def busy_between(cal, start, end):
    busy = []
    for obj in cal.search(start=start, end=end, event=True, expand=True):
        ev = obj.icalendar_component
        if str(ev.get("TRANSP", "")).upper() == "TRANSPARENT":
            continue  # событие помечено «свободна» — не мешает записи
        s = _as_dt(ev["DTSTART"].dt)
        if "DTEND" in ev:
            e = _as_dt(ev["DTEND"].dt)
        elif "DURATION" in ev:
            e = s + ev["DURATION"].dt
        else:
            e = s + timedelta(days=1) if not isinstance(ev["DTSTART"].dt, datetime) else s
        busy.append((s, e))
    return busy


def _busy_days(cal, first, last):
    pad = timedelta(minutes=BUFFER_MIN)  # дорога может задеть соседний день
    return busy_between(cal, datetime.combine(first, time(0), TZ) - pad,
                        datetime.combine(last + timedelta(days=1), time(0), TZ) + pad)


def _month_days(month, today):
    first = datetime.strptime(month, "%Y-%m").date()
    last = (first.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    first, last = max(first, today), min(last, today + timedelta(days=HORIZON_DAYS))
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def get_slots(params, cal=None, now=None):
    now = now or datetime.now(TZ)
    service = params.get("service") or next(iter(SERVICES))
    if service not in SERVICES:
        return 400, {"error": "Неизвестная услуга"}
    month = params.get("month") or now.strftime("%Y-%m")
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        return 400, {"error": "Неверный месяц"}
    days = _month_days(month, now.date())
    result = {"services": [{"id": k, "name": n, "minutes": m} for k, (n, m) in SERVICES.items()],
              "days": {}}
    if days:
        cal = cal or _calendar()
        busy = _busy_days(cal, days[0], days[-1])
        minutes = SERVICES[service][1]
        for d in days:
            starts = free_starts(d, minutes, busy, now)
            result["days"][d.isoformat()] = [t.strftime("%H:%M") for t in starts]
    return 200, result


PHONE_RE = re.compile(r"^\+?[\d\s()\-]{10,20}$")


def _clean(value, limit):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def create_booking(data, cal=None, now=None):
    now = now or datetime.now(TZ)
    if data.get("website"):          # скрытое поле-ловушка: его заполняют только боты
        return 200, {"ok": True}
    service = data.get("service")
    if service not in SERVICES:
        return 400, {"error": "Выберите услугу"}
    name, phone = _clean(data.get("name"), 80), _clean(data.get("phone"), 20)
    address, comment = _clean(data.get("address"), 200), _clean(data.get("comment"), 500)
    if not name:
        return 400, {"error": "Укажите имя"}
    if not PHONE_RE.match(phone):
        return 400, {"error": "Проверьте номер телефона"}
    if not data.get("consent"):
        return 400, {"error": "Нужно согласие на обработку данных"}
    try:
        start = datetime.strptime(f"{data.get('date')} {data.get('time')}", "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
    except (TypeError, ValueError):
        return 400, {"error": "Выберите дату и время"}

    title, minutes = SERVICES[service]
    cal = cal or _calendar()
    day = start.date()
    busy = _busy_days(cal, day, day)
    # Перепроверяем на сервере: пока клиентка заполняла форму, время могли занять.
    # ponytail: две заявки в одну и ту же секунду обе пройдут; для одного мастера
    # это не случается, иначе — блокировка на время записи.
    if start not in free_starts(day, minutes, busy, now):
        return 409, {"error": "Это время уже занято — выберите другое"}

    end = start + timedelta(minutes=minutes)
    details = "\n".join(filter(None, [
        f"Услуга: {title}",
        f"Имя: {name}",
        f"Телефон: {phone}",
        address and f"Адрес: {address}",
        comment and f"Комментарий: {comment}",
        "",
        "Заявка с сайта — ждёт подтверждения. Созвонитесь и поправьте событие при необходимости.",
    ]))
    cal.save_event(_ical(start, end, f"Заявка: {title} — {name}", details, address))
    error = _notify(f"Новая заявка на запись\n{start:%d.%m.%Y}, {start:%H:%M}–{end:%H:%M}\n{details}")
    # Заявка уже в календаре, поэтому ok в любом случае; telegram — для диагностики.
    return 200, {"ok": True, "telegram": error or "sent"}


def _ical(start, end, summary, description, location):
    def esc(s):
        return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

    fmt = "%Y%m%dT%H%M%S"
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//nastya-site//booking//RU",
        "BEGIN:VEVENT",
        f"UID:{uuid.uuid4()}@nastya-site",
        f"DTSTAMP:{datetime.now(ZoneInfo('UTC')):{fmt}}Z",
        f"DTSTART;TZID=Europe/Moscow:{start:{fmt}}",
        f"DTEND;TZID=Europe/Moscow:{end:{fmt}}",
        f"SUMMARY:{esc(summary)}",
        f"DESCRIPTION:{esc(description)}",
        f"LOCATION:{esc(location)}" if location else None,
        "STATUS:TENTATIVE",
        "END:VEVENT", "END:VCALENDAR",
    ]
    return "\r\n".join(line for line in lines if line)


def _notify(text):
    """Шлёт сообщение в Telegram. Возвращает None или текст ошибки (без токена).

    Из российских облаков api.telegram.org недоступен, поэтому при заданном
    RELAY_URL сообщение уходит через посредника (backend/telegram-relay.gs).
    """
    relay, secret = os.environ.get("RELAY_URL"), os.environ.get("RELAY_SECRET")
    token, chat = os.environ.get("TG_BOT_TOKEN"), os.environ.get("TG_CHAT_ID")
    if relay and secret:
        url = relay
        body = json.dumps({"secret": secret, "text": text}).encode()
    elif token and chat:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        body = urllib.parse.urlencode({"chat_id": chat, "text": text}).encode()
    else:
        return "not configured"
    try:
        answer = urllib.request.urlopen(url, body, timeout=10).read().decode(errors="replace")
        if '"ok":true' not in answer.replace(" ", ""):
            error = f"answer: {answer[:200]}"
            print("telegram failed:", error)
            return error
    except urllib.error.HTTPError as err:
        error = f"HTTP {err.code}: {err.read().decode(errors='replace')[:200]}"
    except OSError as err:  # заявка уже в календаре — не теряем её из-за Telegram
        error = f"{type(err).__name__}: {err}"
    else:
        return None
    print("telegram failed:", error)
    return error


def handler(event, context):
    headers = {
        "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json; charset=utf-8",
    }
    method = event.get("httpMethod", "GET")
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": headers, "body": ""}
    try:
        if method == "POST":
            body = event.get("body") or "{}"
            if event.get("isBase64Encoded"):
                body = base64.b64decode(body).decode()
            status, payload = create_booking(json.loads(body))
        else:
            status, payload = get_slots(event.get("queryStringParameters") or {})
    except Exception as err:  # noqa: BLE001 — клиентке нужен ответ, детали — в логи
        print("error:", repr(err))
        status, payload = 502, {"error": "Календарь недоступен, напишите в Telegram"}
    return {"statusCode": status, "headers": headers,
            "body": json.dumps(payload, ensure_ascii=False)}
