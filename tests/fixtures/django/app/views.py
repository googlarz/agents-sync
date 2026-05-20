from rest_framework import viewsets
from .models import Product
from .serializers import ProductSerializer

# FIXME: add pagination — currently returns all products (can be thousands)
class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
