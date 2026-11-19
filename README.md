# sellgar.store.service

Store владеет связями магазина с каталогом, учетными записями, ценами и остатками.
Каталогом владеет product_srv_v2, информацией магазина — shop_srv.

## Модель

```text
store_product (shop_uuid, product_uuid)
  └─ store_offer (variant_uuid, цена)
       ├─ accounting_record (uuid, уникальный article, order внутри оффера)
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
- store.product.getByRecordUuid: `{ recordUuid }` — полный Store Product по учетной записи,
  включая скрытые/архивные связи и нулевые остатки; внутреннее восстановление проекций Cart.
- store.product.create: `{ commandId, shopUuid, productUuid, showing, offers }`;
- store.product.update: `{ commandId, uuid, expectedVersion, showing?, offers? }`;
- store.product.archive: `{ commandId, uuid, expectedVersion }`;
- store.offer.getAll: `{}` — только доступные для витрины связи;
- store.offer.getByUuid: `{ uuid }` — связь с учетными записями, соседние варианты и категории товара;
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
      { "article": "BLUE-S", "order": 0, "clarifications": [{ "value": "S евростандарт" }] },
      { "article": "BLUE-L", "order": 1, "clarifications": [{ "value": "L евростандарт" }] }
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
требует platform-express, но внутренний HTTP health доступен на PORT (default 8080). Outbox relay использует
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
очередью текущего Product service. Доменные команды остаются в RMQ; внутренний `/health` проверяет БД и оба consumer.

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

## Дерево категорий магазина

Store владеет категориями. `store.category.getTree` принимает `{ shopUuid }` и
возвращает `{ shopUuid, nodes }`. Дерево полное, без пагинации; корни находятся в
`nodes`, непосредственные потомки — в `children`, у листьев `children: []`.
Узел: uuid, version, shopUuid, parentUuid (null у корня), name, description
(string|null), sortOrder, createdAt/updatedAt (ISO), children. Порядок соседей:
`sortOrder`, затем UUID. Одинаковые названия в разных ветках допустимы.

Схема создаётся миграцией `CreateCategoryTree1794733200000`. Composite FK не
разрешает родителя из другого магазина. Удаление родителя с детьми запрещено.
Названия среди соседей уникальны без учёта регистра; крайние пробелы запрещены.
Неизвестный shop snapshot даёт 404, существующий магазин без категорий — пустое
дерево. Повреждённое дерево (цикл/пропавший родитель) не выдаётся частично.

Команды карточки:

- `store.category.getByUuid`: `{ uuid }` → отдельная Category без children.
- `store.category.create`: `{ commandId, shopUuid, parentUuid, name, description }`.
- `store.category.update`: `{ commandId, uuid, expectedVersion, parentUuid, name, description }`.

ParentUuid и description обязательны, допускают null. Название обрезается по краям,
должно содержать 1–512 символов. ShopUuid неизменяем. Создание и смена родителя
добавляют узел в конец соседей. Правка сохраняет все поля атомарно и повышает version.
Повтор commandId возвращает сохранённый результат; иной запрос с тем же ID и
устаревшая версия дают 409. Дубли названия среди соседей дают 409; чужой родитель
и цикл — 400. Все изменения дерева одного магазина сериализуются advisory lock;
проверка предков выполняется под этой блокировкой, включая конкурентные переносы.
Category write и outbox `store.category.created`/`store.category.updated` фиксируются
вместе. Создание и редактирование не требуют новой миграции.

Удаление, отдельное управление порядком, привязка к store_product и проекция путей
для хлебных крошек будут реализованы отдельно.

Для локальных примеров после `yarn migration:run`:

```bash
yarn seed:categories <shopUuid>
```

Seed требует существующий shop snapshot, добавляет примеры глубиной от одного
до пяти уровней в одной транзакции. Если у магазина уже есть категории, ничего
не меняет. При запуске сервиса примеры автоматически не создаются.

### Категории продаваемого товара

`store.product.create/update` принимают `categoryUuids?: string[]`. Создание без поля
означает отсутствие категорий; PATCH без поля сохраняет набор, `[]` снимает все
привязки. Read model и outbox возвращают `categoryUuids: string[]`. Допускаются
только конечные категории того же магазина. Связи хранятся в `store_product_category`
с составными FK по магазину. Версия, связи, остальные поля и событие сохраняются
атомарно; commandId обеспечивает повтор команды.

Чтобы добавить подкатегорию в используемый товарами лист, сначала перенесите
привязки товаров. Общая блокировка shopUuid защищает правило от гонки с сохранением товара.

### Категории в карточке витрины

`store.offer.getByUuid` возвращает `categories: { categoryUuid, items: { uuid, name }[] }[]`
рядом с `offer` и `siblingOffers`. Каждая назначенная конечная категория содержит полный
путь от корня до листа. Имена и родители берутся из текущего дерева Store при чтении;
без привязок возвращается `[]`. Привязки принадлежат Store Product и общие для его вариантов.
`categoryUuids` в командах записи и административной модели остаётся массивом UUID.

### Порядок событий и восстановление Product

OutboxModule и OutboxWriter предоставляет общая workspace-библиотека `@sellgar/outbox`
из nested submodule `code/library/sellgar.outbox.library`. ApiV1Module регистрирует модуль
один раз с STORE_OUTBOX_OPTIONS; StoreEventRepository формирует payload/schemaVersion
и передаёт текущий EntityManager writer. Локальных relay/repository нет. `yarn build`
сначала собирает библиотеку. Таблица и миграции по-прежнему принадлежат Store.

Outbox публикует изменения каждого `(producer, aggregateType, aggregateUuid)` по
`aggregateVersion`. Неопубликованная младшая версия блокирует следующие, включая
ожидание retry и terminal `dead`; другие агрегаты продолжают работу. Relay
выбирает следующую версию после публикации предыдущей, в пределах общего batchSize.
Исчерпанные retry требуют восстановления оператором, а не пропуска события.

Product schemaVersion=3 consumer при разрыве версий сохраняет `sync_issue` и
запрашивает полный актуальный снимок через существующий `CatalogSyncService`.
ACK выполняется после восстановления; ошибка приводит к NACK/requeue. Повтор
parked-события снова требует recovery, даже если уже пришёл предшественник.
Снимок не откатывает более новую проекцию и атомарно закрывает покрытые issues
и parked inbox-записи. Публичные контракты событий не меняются.

Проверки в отдельных временных схемах PostgreSQL:

```bash
yarn test:integration outbox-ordering
yarn test:integration snapshot-recovery
```

### Порядок учётных записей

`records[].order` — неотрицательное целое, уникальное внутри оффера. Чтение всегда возвращает записи по нему, без сортировки размеров или текста уточнений. PATCH может переставлять существующие UUID, не затрагивая их остатки. Если order не передан, существующее значение сохраняется; новая запись добавляется после последней. Дубли порядка отклоняются атомарно. Миграция `AccountingRecordOrder1795000000000` заполняет начальные значения для существующих записей, не меняя их текущую последовательность. Дальше последовательностью управляет администратор.


## CI и Kubernetes

Yarn root, `src`, `test` и `library` находятся внутри `code/`. Команды из разделов
выше выполнять из `code/`. Dockerfile, `.github/` и `helm/` — в корне.
`helm/values.app.yaml` содержит общую конфигурацию; `helm/dev/values.yaml` — одну
реплику и ConfigMap `.env`. Общие templates принадлежат infrastructure/chart application.
Prod values заполняются при подключении prod, который сейчас не развёрнут.

Node 24 production image содержит compiled service, общую outbox-библиотеку и
production dependencies. PostgreSQL 16 используется только в verifier stage для
unit/integration tests. Production-image smoke запускается из корня:
`python3 .github/scripts/smoke-image.py <image>`; он использует отдельные временные
PostgreSQL/RabbitMQ, без рабочих volumes. Проверяются пять миграций и повторный
запуск, snapshots/inbox, категории, цена, учётные записи, остатки, идемпотентность,
409, FTS и outbox. Отключение проверочного RabbitMQ переводит health в 503.

В Kubernetes внутренний container/Service 8080; публичного Ingress нет. База/роль
`store_srv` приходят от CloudNativePG, credentials — Secret `store-database`.
`.env` монтируется в `/app/.env`; RabbitMQ — Secret `rabbitmq-default-user`.
Миграционный Job запускает `node --env-file=.env node_modules/typeorm/cli.js -d
 dist/database/data-source.js migration:run` до Deployment. Synchronize отключён.

Ветки и релизный цикл: `development` → CI/GHCR; `release/*` → проверка выпуска;
production promotion запускается вручную с сохранением проверенного digest.
Первичное восстановление dev-проекций из уже опубликованных сохранённых событий
владельцев описывается в infrastructure. Это не импорт локальных баз.
