# sellgar.store.service

Сервис продаваемых товаров Sellgar. Он отделяет каталог от факта продажи.

## Зона ответственности

- `store_product` - продаваемый товар в конкретном магазине/канале;
- `store_offer` - продажное предложение по варианту каталога;
- `price_history` - история цен предложения;
- `offer_inventory` - текущее количество и резерв;
- `inventory_movement` - история прихода, списания и корректировок;
- `currency` - локальный предзаполненный справочник валют;
- `reservation` - следующая зона развития.

Цена хранится в PostgreSQL как `numeric(12,2)`, а в TypeScript/API передается
строкой (`"1299.90"`). Для денег не использовать `double precision` и скрытые
преобразования в JS `number`.

Остатки не редактируются как обычное поле карточки offer. Изменения проходят
через отдельные команды: приход, списание и корректировка. Команда обновляет
`offer_inventory` и пишет строку в `inventory_movement` в одной транзакции.

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
