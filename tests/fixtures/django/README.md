# Inventory API

Django REST API for inventory management.

## Setup
```bash
pip install poetry
poetry install
python manage.py migrate
python manage.py runserver
```

## Testing
```bash
pytest
pytest --cov=app
```

## Architecture
- `app/` — Django app: models, views, serializers, urls
- `inventory/` — project settings and wsgi

## Conventions
- snake_case for all Python identifiers
- Views use DRF ViewSets, not function-based views
- All models must have `__str__` defined
