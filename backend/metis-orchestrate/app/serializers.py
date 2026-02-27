from rest_framework import serializers

from app.models import SampleItem


class SampleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SampleItem
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "is_active",
        ]
