# sellgar.store.service

Сервис продаваемых товаров Sellgar. Он отделяет каталог от факта продажи.

## Зона ответственности

- `store_product` - продаваемый товар в конкретном магазине/канале;
- `store_variant_offer` - продажное предложение по варианту каталога;
- `price_history` - история цен предложения;
- `inventory` - количество и резерв;
- `currency` - локальный предзаполненный справочник валют;
- `reservation` и stock movements - следующая зона развития.

## Внешние данные

`store_srv` не владеет catalog product/variant и shop. Для внешних агрегатов
используются external UUID и минимальные snapshots:

- `product_snapshot`;
- `variant_snapshot`;
- `shop_snapshot`.

Snapshots не являются источником истины. Они нужны для локальной проверки команд
и быстрых read-model. Полные карточки товара, свойства, изображения, бренды и
категории должны собираться в gateway/BFF через сервисы-владельцы.

## События

`store_srv` принимает integration events от `product_srv` и `shop_srv` через
RabbitMQ event exchange. Каждое событие фиксируется в `inbox_event`.

Если событие нарушает порядок версий или пришло без родителя, сервис пишет
`sync_issue` и не применяет его вслепую.

## Проверка

```bash
yarn build
```

Runtime-проверка после изменений snapshot/event handling: создать или изменить
variant в admin UI и проверить `inbox_event`, `variant_snapshot` и `sync_issue`.
