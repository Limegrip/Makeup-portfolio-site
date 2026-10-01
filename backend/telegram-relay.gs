// Посредник для уведомлений: Yandex Cloud → Google Apps Script → Telegram.
// Из российских облаков api.telegram.org недоступен, а серверы Google — да.
//
// Script Properties (Настройки проекта → Свойства скрипта):
//   TG_BOT_TOKEN  — токен бота от @BotFather
//   TG_CHAT_ID    — кому слать (chat id)
//   RELAY_SECRET  — тот же секрет, что в переменной RELAY_SECRET функции;
//                   без него любой, кто узнал адрес, мог бы слать сообщения боту.
function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const data = JSON.parse(e.postData.contents);
  if (data.secret !== props.getProperty('RELAY_SECRET')) {
    return ContentService.createTextOutput('{"ok":false,"description":"forbidden"}');
  }
  const res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + props.getProperty('TG_BOT_TOKEN') + '/sendMessage',
    { method: 'post', muteHttpExceptions: true, payload: {
      chat_id: props.getProperty('TG_CHAT_ID'), text: data.text,
      // Без превью: иначе Telegram сам откроет ссылку на заявку и скачает её данные за рубеж.
      disable_web_page_preview: 'true'
    } }
  );
  return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
}
