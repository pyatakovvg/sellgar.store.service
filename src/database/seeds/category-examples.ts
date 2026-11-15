import { randomUUID } from 'node:crypto';
import { CategoryNodeEntity } from '../../api/v1/category/entity/category-node.entity';
import { CategoryTreeEntity } from '../../api/v1/category/entity/category-tree.entity';

interface CategoryExample {
  name: string;
  description?: string;
  children?: CategoryExample[];
}

const EXAMPLE_CREATED_AT = '2026-11-15T09:00:00.000Z';

const CATEGORY_EXAMPLES: CategoryExample[] = [
  {
    name: 'Продукты и напитки',
    description: 'Еда и напитки на каждый день',
    children: [
      {
        name: 'Напитки',
        children: [
          {
            name: 'Чай',
            description: 'Листовой чай и чайные смеси',
            children: [
              {
                name: 'Зелёный чай',
                children: [
                  { name: 'Японский', description: 'Сенча, гёкуро и матча' },
                  { name: 'Китайский', description: 'Лунцзин, би ло чунь и другие сорта' },
                ],
              },
              { name: 'Чёрный чай' },
              { name: 'Травяные сборы', description: 'Напитки без чайного листа' },
            ],
          },
          { name: 'Кофе', description: 'Зерновой и молотый' },
          { name: 'Вода' },
        ],
      },
      {
        name: 'Бакалея',
        children: [{ name: 'Крупы' }, { name: 'Макаронные изделия' }],
      },
    ],
  },
  {
    name: 'Дом',
    description: 'Посуда и предметы для дома',
    children: [
      {
        name: 'Посуда',
        children: [
          { name: 'Термокружки', description: 'Для дома, офиса и дороги' },
          { name: 'Чайники' },
          { name: 'Чашки и блюдца' },
        ],
      },
      { name: 'Текстиль', description: 'Полотенца, пледы и постельное бельё' },
    ],
  },
  {
    name: 'Туризм',
    description: 'Снаряжение для походов и отдыха на природе',
    children: [
      {
        name: 'Посуда',
        children: [
          { name: 'Термокружки', description: 'Лёгкие и ударопрочные модели для походов' },
          { name: 'Котелки' },
        ],
      },
      {
        name: 'Снаряжение',
        children: [{ name: 'Рюкзаки' }, { name: 'Палатки' }],
      },
    ],
  },
  {
    name: 'Электроника',
    children: [
      {
        name: 'Аксессуары',
        children: [
          {
            name: 'Кабели и переходники',
            children: [{ name: 'USB-C', description: 'Зарядка и передача данных' }, { name: 'HDMI' }],
          },
          { name: 'Зарядные устройства' },
        ],
      },
    ],
  },
  {
    name: 'Книги',
    children: [{ name: 'Художественная литература' }, { name: 'Нон-фикшн' }, { name: 'Детские книги' }],
  },
  { name: 'Подарочные сертификаты', description: 'Самостоятельная категория без подкатегорий' },
];

export const createCategoryTreeExample = (shopUuid: string): CategoryTreeEntity => {
  const buildNodes = (examples: CategoryExample[], parentUuid: string | null): CategoryNodeEntity[] =>
    examples.map((example, sortOrder) => {
      const uuid = randomUUID();

      return {
        uuid,
        version: 1,
        shopUuid: shopUuid,
        parentUuid,
        name: example.name,
        description: example.description ?? null,
        sortOrder,
        createdAt: EXAMPLE_CREATED_AT,
        updatedAt: EXAMPLE_CREATED_AT,
        children: buildNodes(example.children ?? [], uuid),
      };
    });

  return { shopUuid: shopUuid, nodes: buildNodes(CATEGORY_EXAMPLES, null) };
};
