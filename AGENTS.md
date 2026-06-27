# @service/store

`sellgar.store.service` - сервис продаваемых товаров. Он отделен от `sellgar.product.service`, потому что каталог описывает структуру товара, а store описывает фактический товар для продажи.

## Граница

- Product service владеет catalog product/variant/property/image.
- Shop service владеет магазинами/каналами продаж.
- Store service должен владеть sellable product, sellable variant, ценой, остатками и резервами.

## Правила

- Не переносить legacy `store` из product service один-в-один.
- Не добавлять cart/order lifecycle в этот сервис.
- Не хранить catalog product data как источник истины; хранить ссылки и при необходимости read snapshots для внешних сценариев.
- Перед добавлением таблиц сначала зафиксировать целевую модель `store_product`, `store_variant`, price history, inventory balance/reservation.

## Проверка

```bash
yarn --version
yarn build
```
