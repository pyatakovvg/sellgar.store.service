# @service/store

`sellgar.store.service` - сервис продаваемых товаров. Он отделен от `sellgar.product.service`, потому что каталог описывает структуру товара, а store описывает фактический товар для продажи.

## Граница

- Product service владеет catalog product/variant/property/image.
- Shop service владеет магазинами/каналами продаж.
- Store service владеет категориями магазина: отдельное дерево на shopUuid.
- Store service должен владеть sellable product, связью с вариантом, учетными записями, ценой, остатками и резервами.

## Правила

- Не переносить legacy `store` из product service один-в-один.
- Не добавлять cart/order lifecycle в этот сервис.
- Не хранить catalog product data как источник истины; хранить external UUID и
  минимальные snapshots для локальной проверки и read-model.
- `product_snapshot` и `variant_snapshot` должны оставаться минимальными: UUID,
  `source_version`, имя, статус и технические timestamps. `shop_snapshot` хранит UUID,
  `source_version`, имя и технические timestamps; lifecycle у Shop отсутствует.
- Полную модель товара/варианта/магазина собирает gateway/BFF через сервисы
  владельцы, а не `store_srv`.
- Currency является общей бизнес-сущностью и называется `currency`, без
  `shopCurrency`, `variantCurrency` или других переименований.
- Product/variant snapshot consumer должен применять `payload.status` как источник истины. Имя события
  (`*.deleted`, `*.disabled`, `*.archived`) можно использовать только как fallback для старых
  сообщений без явного `status`.
- Принятые уточнения учетных записей — только текстовые value, без Property FK.
- У store_product/store_offer нет артикула; уникальный article принадлежит accounting_record.
- Перед расширением таблиц сверять целевую модель `store_product`,
  `store_offer`, `accounting_record`, `record_clarification`, `price_history`,
  `record_inventory`, `inventory_movement`; reservation пока не реализован.
- `store_offer` обязан ссылаться на `store_product` и `variant_snapshot` через
  composite FK с `product_uuid`: вариант из другого product не должен пройти
  даже при ошибке в прикладном коде.
- Деньги хранить как PostgreSQL `numeric(12,2)`, а в TypeScript DTO/entity держать
  строкой. Не добавлять TypeORM transformer в `number` и не возвращать цену как
  JS floating-point.
- Остатки не менять через `updateStoreProduct`. Текущее состояние хранит
  `record_inventory`, история причин хранится в `inventory_movement`; они пишутся
  вместе отдельными inventory-командами.
- Все read-команды `store.product.getAll`/`getByUuid` и `store.offer.getAll`/`getByUuid`
  принимают один плоский `query`: search, shopUuid, productUuid, productStatus,
  productShowing, variantStatus, variantShowing, quantityMin/Max, reservedMin/Max,
  availableMin/Max. Без фильтров возвращают все записи, включая скрытые и архивные.
- Фильтры применяются SQL к одной цепочке product–offer–record и ограничивают
  состав вложенных offers/records. Границы включительные; false и 0 не пропускаются.
  Query карточки проверяется так же, как query списка; отсутствие совпадений дает 404.
- Политику витрины задает client gateway, не Store. Catalog snapshot status не
  подменяет собственный status Store; актуальность каталога проверяет BFF у владельца.
- `search` использует PostgreSQL FTS по названиям product/variant snapshot и
  артикулу accounting_record. Только эти поля; уточнения и описания не индексируются.
  Один `accounting_record.search_vector` и один GIN `accounting_record_search_idx`.
  Миграционные триггеры обновляют документ при переименованиях и новых записях.
  Поиск поддерживает префиксы и русские словоформы; ILIKE/LIKE для поиска запрещены.
- Поиск по артикулу отбирает соответствующую ветку варианта, сохраняя остальные
  записи этой ветки, если числовые фильтры их не исключают. Поисковая запись сама
  обязана удовлетворять заданным inventory-границам.
- Внешние события применять через idempotent `inbox_event`; при `version_gap`
  или `missing_parent` писать `sync_issue`, а не применять событие вслепую.
- При разрыве версий Product consumer вызывает существующий CatalogSyncService и восстанавливает полный снимок у Product service до ACK. Ошибка восстановления приводит к NACK/requeue; `synchronizeProduct` закрывает покрытые снимком sync_issue и parked inbox-записи. Порядок доставки событий не должен оставлять проекцию навсегда устаревшей.
- Повтор parked Product-события снова требует восстановления, даже если предшественник уже применён. Иначе неудавшийся recovery может закончиться ACK без закрытия остальных разрывов. Проверка: `yarn test:integration snapshot-recovery` использует только временную схему PostgreSQL.

## Проверка

```bash
yarn --version
yarn build
```

Изменения схемы выполняются явными миграциями, synchronize отключен. Сверяйте
контракты и примеры команд с README.md. Product snapshot принимает только
product_srv_v2 schemaVersion=3. Bootstrap: один Nest-контекст с двумя RMQ-очередями и внутренним health HTTP на 8080.
OutboxModule из @sellgar/outbox подключается один раз в ApiV1Module. Общий пакет
в code/library/sellgar.outbox.library владеет writer, repository, relay, retry, timeout
и метриками. В сервисе остаются STORE_OUTBOX_OPTIONS и доменный StoreEventRepository,
передающий событие OutboxWriter с текущим EntityManager. Локальные копии relay/repository запрещены.
Порядок публикации внутри `(producer, aggregateType, aggregateUuid)` определяется
`aggregateVersion`. Любой неопубликованный предшественник, включая dead/backoff,
блокирует последующие версии. Разные агрегаты не блокируют друг друга. Relay
повторяет claim в пределах суммарного batchSize; порядок UPDATE RETURNING не используется.

## Категории товара Store

- Store Product связан с несколькими конечными категориями своего магазина.
- categoryUuids в create/update задаёт полный набор; [] очищает, отсутствие поля в PATCH сохраняет привязки.
- Все изменения, версия и outbox фиксируются одной транзакцией. Чужие категории, ветви и дубли отклоняются.
- Связи находятся в store_product_category, composite FK проверяют общий shopUuid.
- Категории, назначенные товарам, нельзя превращать в ветви до переноса привязок. Записи категорий и привязок сериализуются общей блокировкой магазина.

## Порядок учётных записей

- `AccountingRecord.order` — неотрицательное целое, уникальное внутри оффера. Store возвращает records по order; дата и UUID не задают отображение.
- Metadata-команда принимает order у записи; отсутствие сохраняет текущий порядок, новая запись без order добавляется в конец. Перестановка сохраняется атомарно с версией Store Product и событием; идентичность и остатки не меняются.

## Деплой

- Рабочая ветка — `development`, выпуск — `master`; без запроса новые ветки не создавать.
- Yarn root, исходники, tests и nested outbox находятся в `code/`; команды выше выполнять оттуда.
- В корне находятся Dockerfile, `.github/` CI и `helm/` values. Общий chart — в infrastructure.
- ConfigMap приложения монтирует `.env`; credentials приходят из Secret env refs.
- Внутренние container/Service: 8080, без Ingress. `/health` проверяет PostgreSQL и оба RMQ-consumer.
- CI проверяет unit/integration tests на временной PostgreSQL 16; финальный runtime не содержит БД или test tooling.
- Миграционный Job предшествует Deployment. Локальные данные и env в Git/образ не включать.

## Цены учётных записей

Цена и история принадлежат accounting_record (price_history.record_uuid), не store_offer.
Новая запись требует currentPrice; отсутствие поля у существующей сохраняет цену.
Смена цены закрывает предыдущую строку и создаёт новую в транзакции Store Product с его версией и outbox.
В полном снимке history загружается отдельным batch-запросом, без JOIN history × records × clarifications.
priceRange вычисляется Store по уже отфильтрованным records; при разных валютах единого диапазона нет.
Store Product event schemaVersion=3, Inventory event schemaVersion=2. Порядок несовместимой миграции описан в README.
