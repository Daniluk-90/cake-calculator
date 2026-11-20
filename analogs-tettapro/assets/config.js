/* Настройки сервиса. Меняйте здесь контакты и ссылки. */
window.TETTA_CONFIG = {
  // Куда уходят запросы цены, «Купить все» и обратная связь
  salesEmail: "sales@mechatronics.ru",
  // Техническая поддержка по подбору аналогов
  supportEmail: "sales@mechatronics.ru",
  // Страница каталога (используется как ссылка для моделей без своей страницы)
  catalogUrl: "https://ps.tetta.pro/",
  // Если референс нагружает подобранную модель больше этой доли её мощности,
  // дополнительно предлагается следующая модель «с запасом по мощности»
  marginThreshold: 0.8,

  // Дополнительные данные моделей TettaPRO, которых нет в Excel-таблице:
  // фото, страница товара, КПД, гарантия, сигнал DC OK.
  productExtras: {
    "MTPR-M02024": { image: "assets/img/mtpr-m02024.webp", url: "https://ps.tetta.pro/products/mtpr-m02024/", efficiency: "84%", dcok: "Активный сигнал DC OK" },
    "MTPR-M04024": {},
    "MTPR-M06024": { image: "assets/img/mtpr-m06024.webp", url: "https://ps.tetta.pro/products/mtpr-m06024/", efficiency: "86%", dcok: "Контакт реле DC OK" },
    "MTPR-E12024": { image: "assets/img/mtpr-e12024.webp", url: "https://ps.tetta.pro/products/mtpr-e12024/", efficiency: "87%" },
    "MTPR-E24024": {},
    "MTPR-X12024": {},
    "MTPR-X24024": { image: "assets/img/mtpr-x24024.webp", url: "https://ps.tetta.pro/products/mtpr-x24024/", efficiency: "95,2%", dcok: "Реле DC OK" },
    "MTPR-X48024": {},
    "MTPR-X96024": {}
  },
  // Гарантия на все модели
  warranty: "30 месяцев"
};
