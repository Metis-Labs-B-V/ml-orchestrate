from django.db import models

from common_utils.base_model.models import BaseModel


class SampleItem(BaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")

    def __str__(self):
        return self.name
