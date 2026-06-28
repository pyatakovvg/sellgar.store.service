# @service/store

`sellgar.store.service` - сервис продаваемых товаров. Он отделен от `sellgar.product.service`, потому что каталог описывает структуру товара, а store описывает фактический товар для продажи.

## Граница

- Product service владеет catalog product/variant/property/image.
- Shop service владеет магазинами/каналами продаж.
- Store service должен владеть sellable product, sellable variant, ценой, остатками и резервами.

## Правила

- Не переносить legacy `store` из product service один-в-один.
- Не добавлять cart/order lifecycle в этот сервис.
- Не хранить catalog product data как источник истины; хранить external UUID и
  минимальные snapshots для локальной проверки и read-model.
- `product_snapshot`, `variant_snapshot` и `shop_snapshot` должны оставаться
  минимальными: UUID, `source_version`, имя, статус и технические timestamps.
- Полную модель товара/варианта/магазина собирает gateway/BFF через сервисы
  владельцы, а не `store_srv`.
- Currency является общей бизнес-сущностью и называется `currency`, без
  `shopCurrency`, `variantCurrency` или других переименований.
- Snapshot consumer должен применять `payload.status` как источник истины. Имя события
  (`*.deleted`, `*.disabled`, `*.archived`) можно использовать только как fallback для старых
  сообщений без явного `status`.
- Перед расширением таблиц сверять целевую модель `store_product`,
  `store_offer`, `price_history`, `inventory`, `reservation`.
- `store_offer` обязан ссылаться на `store_product` и `variant_snapshot` через
  composite FK с `product_uuid`: вариант из другого product не должен пройти
  даже при ошибке в прикладном коде.
- Деньги хранить как PostgreSQL `numeric(12,2)`, а в TypeScript DTO/entity держать
  строкой. Не добавлять TypeORM transformer в `number` и не возвращать цену как
  JS floating-point.
- Внешние события применять через idempotent `inbox_event`; при `version_gap`
  или `missing_parent` писать `sync_issue`, а не применять событие вслепую.

## Проверка

```bash
yarn --version
yarn build
```
