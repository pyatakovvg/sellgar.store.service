# Проверка учетных записей Store — 2026-10-12

Выполнена на локальных store_srv и product_srv_v2 через настоящий RabbitMQ.
Новая схема store_srv создана начальной миграцией с разрешения пользователя.
Справочник валют и снимки магазинов сохранены; каталоговые снимки получены
из текущего product_srv_v2 через store.catalog.synchronize.

## Сценарий

1. Через catalog.v2.productType.create и catalog.v2.product.create создан
   тестовый товар с одним вариантом. Событие product.created обработано Store.
2. Через store.product.create связаны магазин, товар и вариант. Создана одна
   учетная запись с нулевым остатком и пустыми уточнениями.
3. Через store.product.update первоначальная запись получила собственный
   артикул и «S евростандарт»; добавлена вторая запись с другим артикулом,
   «L евростандарт» и «Подарочная упаковка».
4. Через store.inventory.receipt получены остатки 12 и 4. Повтор первой команды
   с тем же commandId вернул 12; inventory_movement остался единственным.
5. Через store.offer.getByUuid получены обе записи с независимыми остатками.
6. Изменение имени через catalog.v2.product.update обработано inbox;
   product_snapshot получил новое имя и версию 2.
7. У одного события совпали eventUuid в product_srv_v2.outbox_event со статусом
   published и store_srv.inbox_event со статусом processed. События карточки
   и остатков Store также опубликованы; неопубликованных событий не осталось.
8. Реальный StoreProductGateway admin gateway получил и провалидировал getAll
   и getByUuid. Client HTTP GET /v1/products и GET /v1/offers/:uuid вернули 200,
   records[] с артикулами, уточнениями и доступными остатками 12/4.
9. Проверка TypeORM schema builder не предложила изменений примененной схемы.
   Временные триггеры, использованные для ожидания commit notifications,
   удалены. Runtime сценарий не использует polling.

Повторная проверка выполнена после согласования одного Nest-контекста с двумя
RMQ microservices. Store и Client gateway оставлены запущенными; Admin gateway
переиспользован. Тестовые товары/шаблоны и складские записи остались в dev базе.

## Автоматические проверки

- Store build и unit tests.
- PostgreSQL integration: 13 сценариев, миграция/ORM, учет, FK, уникальность артикула,
  rollback, идемпотентность, конкурентные команды, защита резерва, фильтры,
  произвольные уточнения и catalog event reconciliation.
- Admin gateway build и tests, включая nested Store entity/realtime и HTTP DTO.
- Client gateway build и tests для состава карточки/учетных записей.

Защищенный Admin HTTP GET /v2/store/products без сессии вернул ожидаемый 401;
полноценный браузерный admin flow не проверялся. Frontend формы склада
не адаптированы.
Cart/order, резервирование заказа, категории и цена отдельной учетной записи
не реализованы в этой задаче. Общий workspace health-check не зеленый:
/health endpoints у Admin gateway, File и Media отсутствуют (404); эти
результаты не использованы вместо прямой проверки Store API.
