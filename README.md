# sellgar.store.service

Store владеет связями магазина с каталогом, учетными записями, ценами и остатками.
Каталогом владеет product_srv_v2, информацией магазина — shop_srv.

## Модель

```text
store_product (shop_uuid, product_uuid)
  └─ store_offer (variant_uuid, цена)
       ├─ accounting_record (uuid, уникальный article)
       │    ├─ record_clarification (position, value)
       │    └─ record_inventory (quantity, reserved, version)
       └─ accounting_record ...
```

На одну связь store_product–variant_uuid приходится одна store_offer.
При ее создании появляется учетная запись с нулевым остатком. Без дополнительных
уточнений clarifications — пустой массив. Для размера, комплектации или другой
конкретизации можно заполнить первоначальную запись и добавить следующие.
Уточнения — произвольные строки, без name и без ссылок на каталоговые свойства.
Они не участвуют в учете отдельно от своей записи.

Артикулы находятся только в accounting_record. Реализация обеспечивает их
уникальность во всей базе Store (с учетом регистра). При отсутствии article
создается `SKU-<uuid записи>`; менеджер может передать свой артикул.
Это техническое правило данной реализации; отдельный бизнес-формат артикула
RFC пока не определяет.

Цена остается на store_offer: перенос цены на учетную запись не утвержден.
PostgreSQL хранит numeric(12,2), API — decimal string, например `"1500.00"`.
Quantity и reserved — целые числа. Дробный учет и партии не реализованы.
У store_product и store_offer нет article и нет общего редактируемого остатка.

FK защищают принадлежность варианта каталога товару, а учетной записи — store_offer.
Учетную запись с остатком/движениями нельзя физически удалить.
CHECK запрещает отрицательные остатки и reserved > quantity. Уточнения сохраняют
порядок через position. Полные свойства, изображения и бренды каталога в Store
не копируются: gateway собирает карточку через сервисы-владельцы.

## Команды

RMQ patterns:

- store.product.getAll: `{ query: { search?, shopUuid?, productUuid? } }`;
- store.product.getByUuid: `{ uuid }`;
- store.product.create: `{ commandId, shopUuid, productUuid, showing, offers }`;
- store.product.update: `{ commandId, uuid, expectedVersion, showing?, offers? }`;
- store.product.archive: `{ commandId, uuid, expectedVersion }`;
- store.offer.getAll: `{}` — только доступные для витрины связи;
- store.offer.getByUuid: `{ uuid }` — связь с учетными записями и соседние варианты;
- store.inventory.receipt / writeOff / adjust:
  `{ commandId, recordUuid, expectedVersion, quantity, reason?, sourceUuid?, createdBy? }`;
- store.catalog.synchronize: `{ productUuid }` — один запрос актуального снимка у каталога.

Пример offers при создании:

```json
[
  {
    "variantUuid": "UUID варианта из product_srv_v2",
    "showing": true,
    "currentPrice": { "value": "1500.00", "currencyCode": "RUB" },
    "records": [
      { "article": "BLUE-S", "clarifications": [{ "value": "S евростандарт" }] },
      { "article": "BLUE-L", "clarifications": [{ "value": "L евростандарт" }] }
    ]
  }
]
```

Можно не передавать records — будет одна запись по умолчанию. Пустой records
запрещен. Для изменения существующего offer или record передается его uuid;
без uuid создается новый. При update не перечисленные записи сохраняются.
clarifications не переданы — сохраняются; `[]` — очищаются; массив — заменяет
уточнения с сохранением указанного порядка. Для существующего offer нужны
variantUuid, showing и currentPrice; нельзя перенести его в другой товар.

Приход и списание используют положительную quantity, корректировка — целевой
остаток, включая ноль. expectedVersion относится к record_inventory.version,
а не к версии карточки или учетной записи. Нельзя списать зарезервированный остаток.
Каждое изменение остатков пишет inventory_movement, outbox_event и command_request
в одной транзакции. Повтор commandId с тем же запросом возвращает сохраненный
результат; иной запрос с тем же id отклоняется. Конкурирующие команды со старой
версией отклоняются без частичных изменений. При update карточки остатки не меняются.
Резервирование для заказа и lifecycle cart/order в эту реализацию не входят.

## События и снимки

По согласованию с пользователем от 2026-10-12 bootstrap использует один
Nest-контекст с двумя RMQ microservices: очередь команд и очередь событий.
Сервисы, пул PostgreSQL и outbox relay создаются один раз. Штатный hybrid bootstrap
требует platform-express, но HTTP-порт не открывается. Outbox relay использует
прежний claim с FOR UPDATE SKIP LOCKED.
События подтверждаются ack после завершения inbox-транзакции.

Store принимает product.created/product.updated только от product_srv_v2,
schemaVersion=3. Shop использует текущие shop.created/shop.updated.
Дубликаты и старые версии игнорируются через inbox; разрыв версий создает sync_issue.
store.catalog.synchronize выполняет единственный authoritative read, разрешает
покрытые снимком разрывы и не откатывает более новую версию. Опросов нет.
После сброса Store эту команду нужно выполнить для уже существующих товаров;
новые товары приходят через события. Каталоговые UUID прежнего сервиса не подменяются.

Создание, изменение и архивирование карточки сохраняют прежние patterns:
store.product.created, store.product.updated и store.product.archived.
Payload нового Store-контракта имеет schemaVersion=2.
Для остатков pattern store.inventory.updated с aggregateType=record_inventory:
payload содержит recordUuid и текущие quantity/reserved/available/version.
Storefront list и detail исключают архивированные товары и варианты каталога,
а также скрытые или архивные связи Store. Учетные данные при этом сохраняются.

## Схема базы и запуск

synchronize отключен. Начальная миграция рассчитана на пустую базу; автоматического
обновления старой offer_inventory нет. Локальная store_srv пересоздана с разрешения
пользователя; валюты и shop_snapshot сохранены, каталоговые снимки загружены из v2.
Откат с удалением учетных данных автоматически не выполняется.

```bash
yarn migration:run
yarn migration:show
yarn start:dev
```

Конфигурация описана в .env.example. PRODUCT_V2_COMMAND_QUEUE должен совпадать с
очередью текущего Product service. HTTP-порт Store не открывает.

## Проверка

```bash
yarn build
yarn test --runInBand
yarn test:integration
```

Интеграционные тесты создают и удаляют только собственную случайную PostgreSQL
схему в настроенной базе. Проверяют миграцию, FK, учет, rollback, идемпотентность,
конкурентные записи, уточнения, фильтры и обработку событий. Доступ к PostgreSQL
обязателен; рабочие таблицы public тесты не очищают.
