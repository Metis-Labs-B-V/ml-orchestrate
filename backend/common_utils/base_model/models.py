from django.db import models

from common_utils.base_model.threadlocals import get_current_request
from .utils import get_user_email_fr_request


class BaseModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(blank=True, null=True, default=None, max_length=255)
    updated_by = models.CharField(blank=True, null=True, default=None, max_length=255)
    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        request = get_current_request()
        current_user_email = get_user_email_fr_request(request)
        is_new = self._state.adding
        if is_new and not self.created_by:
            self.created_by = current_user_email
        self.updated_by = current_user_email
        super().save(*args, **kwargs)
